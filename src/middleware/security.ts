import type { Request, Response, NextFunction } from 'express';
import type { Plugin } from 'graphql-yoga';
import { NoSchemaIntrospectionCustomRule, GraphQLError, Kind, type ASTNode, type DocumentNode, type ValidationContext } from 'graphql';
import { env } from '../config/env.js';

//SECURITY HEADERS.
//
//Hand-written instead of pulling in helmet: this is a JSON API with no browser
//UI of its own, so only a handful of headers apply.
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  //stop a browser guessing a response is HTML and running it
  res.setHeader('X-Content-Type-Options', 'nosniff');
  //this API is never meant to be in an iframe
  res.setHeader('X-Frame-Options', 'DENY');
  //do not leak our URLs to third parties
  res.setHeader('Referrer-Policy', 'no-referrer');
  //everything here is personal — nothing should be cached in between
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('X-Powered-By');

  if (env.IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

//QUERY DEPTH LIMIT.
//
//A GraphQL endpoint will happily run a query nested hundreds of levels deep
//and burn the whole instance doing it. Our deepest real query is about four
//levels, so ten is generous.
//
//Fragments count towards depth — a shallow-looking query that spreads a deeply
//nested fragment is the obvious way around a naive counter.
const depthOf = (node: ASTNode, fragments: Map<string, ASTNode>, seen: Set<string>, current = 0): number => {
  if (current > env.MAX_QUERY_DEPTH) return current;

  switch (node.kind) {
    case Kind.FIELD: {
      if (!node.selectionSet) return current;
      return Math.max(...node.selectionSet.selections.map((s) => depthOf(s, fragments, seen, current + 1)));
    }
    case Kind.FRAGMENT_SPREAD: {
      //A fragment including itself would recurse forever.
      if (seen.has(node.name.value)) return env.MAX_QUERY_DEPTH + 1;
      const fragment = fragments.get(node.name.value);
      if (!fragment) return current;
      return depthOf(fragment, fragments, new Set([...seen, node.name.value]), current);
    }
    case Kind.INLINE_FRAGMENT:
    case Kind.FRAGMENT_DEFINITION:
    case Kind.OPERATION_DEFINITION: {
      const set = 'selectionSet' in node ? node.selectionSet : undefined;
      if (!set) return current;
      return Math.max(...set.selections.map((s) => depthOf(s, fragments, seen, current)));
    }
    default:
      return current;
  }
};

export const securityPlugin: Plugin = {
  onValidate({ addValidationRule }) {
    //Introspection is a development convenience and a production map of the
    //whole API.
    if (env.IS_PRODUCTION) addValidationRule(NoSchemaIntrospectionCustomRule);

    addValidationRule((context: ValidationContext) => ({
      Document(document: DocumentNode) {
        const fragments = new Map<string, ASTNode>();
        for (const definition of document.definitions) {
          if (definition.kind === Kind.FRAGMENT_DEFINITION) {
            fragments.set(definition.name.value, definition);
          }
        }

        for (const definition of document.definitions) {
          if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
          const depth = depthOf(definition, fragments, new Set());
          if (depth > env.MAX_QUERY_DEPTH) {
            context.reportError(
              new GraphQLError(`Query is nested too deeply (${depth} levels, limit ${env.MAX_QUERY_DEPTH}).`, {
                extensions: { code: 'QUERY_TOO_DEEP' },
              })
            );
          }
        }
      },
    }));
  },
};
