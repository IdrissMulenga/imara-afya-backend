//Yoga plugin that translates error messages from the Accept-Language header.
//English responses are left unchanged.
import type { Plugin } from 'graphql-yoga';
import { pickLocale, messageFor } from './messages.js';

type ProcessInput = Parameters<NonNullable<Plugin['onResultProcess']>>[0]['result'];
type Settled = Exclude<ProcessInput, AsyncIterable<unknown>>;
type ErrorLike = { message: string; extensions?: Record<string, unknown> };

const isStream = (result: ProcessInput): result is Extract<ProcessInput, AsyncIterable<unknown>> =>
  Symbol.asyncIterator in Object(result);

export const localizeErrors: Plugin = {
  onResultProcess({ request, result, setResult }) {
    if (isStream(result)) return;

    const locale = pickLocale(request.headers.get('accept-language'));
    if (locale === 'en') return;

    const settled: Settled = result;
    const batch = Array.isArray(settled) ? settled : [settled];
    let anyTouched = false;

    const next = batch.map((single) => {
      const errors = (single as { errors?: readonly ErrorLike[] }).errors;
      if (!errors?.length) return single;

      let touched = false;
      const rewritten = errors.map((error) => {
        const message = messageFor(locale, error.extensions);
        if (!message || message === error.message) return error;

        touched = true;
        return { ...error, message };
      });

      if (!touched) return single;
      anyTouched = true;
      return { ...single, errors: rewritten };
    });

    if (anyTouched) setResult((Array.isArray(settled) ? next : next[0]) as Settled);
  },
};
