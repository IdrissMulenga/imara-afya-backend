import type { Request, Response, NextFunction } from "express"
import type { Plugin } from "graphql-yoga"
import { NoSchemaIntrospectionCustomRule, GraphQLError, type ASTNode } from "graphql"
import { envConf } from './../config/envConf.js';


//SECURITY HEADERS.
//
//Hand-rolled rather than pulling in helmet: this is a JSON API with no browser
//UI of its own, so only a handful of headers actually apply. Add helmet if a
//web dashboard is ever served from this same process.
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
    //don't let a browser guess a response is HTML and run it
    res.setHeader('X-Content-Type-Options', 'nosniff');
    //this API is never meant to be framed
    res.setHeader('X-Frame-Options', 'DENY');
    //don't leak our URLs to third parties
    res.setHeader('Referrer-Policy', 'no-referrer');
    //nothing here should ever be cached by an intermediary — it's all personal
    res.setHeader('Cache-Control', 'no-store');
    //stop tooling advertising the stack
    res.removeHeader('X-Powered-By');

    if (envConf.IS_PRODUCTION) {
        //tell browsers to stick to HTTPS for a year
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
};


//MAXIMUM QUERY DEPTH.
//
//A GraphQL endpoint will happily execute a query nested hundreds of levels deep
//and burn the whole instance doing it. Our deepest legitimate query is about 4
//levels (ramadanSchedule -> medications -> fields), so 10 is generous.
const MAX_DEPTH = 10;

const nodeDepth = (node: ASTNode, current = 0): number => {
    //only selection sets add depth
    const selections = (node as any)?.selectionSet?.selections;

    if (!selections?.length) return current;

    return Math.max(
        ...selections.map((selection: ASTNode) => nodeDepth(selection, current + 1)),
    );
};

const depthLimitRule = (context: any) => ({
    OperationDefinition(node: ASTNode) {
        const depth = nodeDepth(node);

        if (depth > MAX_DEPTH) {
            context.reportError(
                new GraphQLError(`Query is too deeply nested (max ${MAX_DEPTH}).`, {
                    extensions: { code: 'QUERY_TOO_DEEP' },
                }),
            );
        }
    },
});


//Yoga plugin wiring both rules in. Introspection stays on in development so the
//app's tooling and GraphiQL keep working.
export const securityPlugin: Plugin = {
    onValidate({ addValidationRule }) {
        addValidationRule(depthLimitRule);

        if (envConf.IS_PRODUCTION) {
            //without this, anyone can download the entire schema and read off
            //every mutation we expose
            addValidationRule(NoSchemaIntrospectionCustomRule);
        }
    },
};
