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
//levels (todayRoutines -> routines -> fields), so 10 is generous.
const MAX_DEPTH = 10;

//FRAGMENTS COUNT TOWARDS THE DEPTH.
//
//This used to walk only the selection sets it could see directly, so a
//fragment spread scored zero and everything nested inside it was invisible —
//`{ a { ...F } }` measured 2 no matter how deep F went. Since a fragment may
//also spread itself, that was a way to write an arbitrarily deep query and
//never trip the limit.
//
//`seen` breaks the cycle. GraphQL's own rules reject a recursive fragment, but
//this rule runs alongside those rather than after them, so the guard has to be
//here or a self-referencing fragment loops forever before it is ever rejected.
const nodeDepth = (
    node: ASTNode,
    getFragment: (name: string) => any,
    current = 0,
    seen: Set<string> = new Set(),
): number => {
    if ((node as any)?.kind === 'FragmentSpread') {
        const name = (node as any).name.value;

        if (seen.has(name)) return current;

        const fragment = getFragment(name);

        if (!fragment) return current;

        //a spread is not itself a level — the fragment's own selections are
        return nodeDepth(fragment, getFragment, current, new Set(seen).add(name));
    }

    //only selection sets add depth
    const selections = (node as any)?.selectionSet?.selections;

    if (!selections?.length) return current;

    return Math.max(
        ...selections.map((selection: ASTNode) =>
            nodeDepth(selection, getFragment, current + 1, seen)),
    );
};

const depthLimitRule = (context: any) => ({
    OperationDefinition(node: ASTNode) {
        const depth = nodeDepth(node, (name: string) => context.getFragment?.(name));

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
