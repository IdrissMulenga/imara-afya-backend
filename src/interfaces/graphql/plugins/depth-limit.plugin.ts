import type { Plugin } from 'graphql-yoga';
import {
  NoSchemaIntrospectionCustomRule,
  GraphQLError,
  Kind,
  type ASTNode,
  type DocumentNode,
  type ValidationContext,
} from 'graphql';
import { env } from '../../../infrastructure/config/env.js';

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
        ...node.selectionSet.selections.map((selection) =>
          depthOf(selection, fragments, seen, current + 1)
        )
      );
    }

    case Kind.FRAGMENT_SPREAD: {
      //A fragment that includes itself would recurse forever. Treat a repeat
      //as maximum depth rather than following it.
      if (seen.has(node.name.value)) return env.MAX_QUERY_DEPTH + 1;
      const fragment = fragments.get(node.name.value);
      if (!fragment) return current;
      return depthOf(fragment, fragments, new Set([...seen, node.name.value]), current);
    }

    case Kind.INLINE_FRAGMENT:
    case Kind.FRAGMENT_DEFINITION:
    case Kind.OPERATION_DEFINITION: {
      const selectionSet = 'selectionSet' in node ? node.selectionSet : undefined;
      if (!selectionSet) return current;
      return Math.max(
        ...selectionSet.selections.map((selection) =>
          depthOf(selection, fragments, seen, current)
        )
      );
    }

    default:
      return current;
  }
};

export const securityPlugin: Plugin = {
  onValidate({ addValidationRule }) {
    //Introspection is a development convenience and a production map of the
    //whole API. Off wherever it is not needed.
    if (env.IS_PRODUCTION) {
      addValidationRule(NoSchemaIntrospectionCustomRule);
    }

    addValidationRule((validationContext: ValidationContext) => ({
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
            validationContext.reportError(
              new GraphQLError(
                `Query is nested too deeply (${depth} levels, limit ${env.MAX_QUERY_DEPTH}).`,
                { extensions: { code: 'QUERY_TOO_DEEP' } }
              )
            );
          }
        }
      },
    }));
  },
};
