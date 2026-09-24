import type { Request, Response, NextFunction } from 'express';
import type { Plugin } from 'graphql-yoga';
import {
  NoSchemaIntrospectionCustomRule,
  GraphQLError,
  Kind,
  type ASTNode,
  type DocumentNode,
  type ValidationContext,
} from 'graphql';
import { env } from '../../config/env.js';

export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('X-Powered-By');

  if (env.IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

//Depth of a selection set, following fragments.
const depthOf = (
  node: ASTNode,
  fragments: Map<string, ASTNode>,
  seen: Set<string>,
  current = 0
): number => {
  if (current > env.MAX_QUERY_DEPTH) return current;

  switch (node.kind) {
    case Kind.FIELD: {
      if (!node.selectionSet) return current;
      return Math.max(
        ...node.selectionSet.selections.map((s) => depthOf(s, fragments, seen, current + 1))
      );
    }
    case Kind.FRAGMENT_SPREAD: {
      //Self-referencing fragment.
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
              new GraphQLError(
                `Query is nested too deeply (${depth} levels, limit ${env.MAX_QUERY_DEPTH}).`,
                {
                  extensions: { code: 'QUERY_TOO_DEEP' },
                }
              )
            );
          }
        }
      },
    }));
  },
};
