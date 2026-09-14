import 'react';

/**
 * React 19's current type declarations require an explicit initializer for
 * useRef(), while older Verigence code and capture-only lazy refs use the
 * semantically equivalent no-argument form. Keep the compatibility overload
 * local to compile-time typing; it does not change React runtime behaviour.
 */
declare module 'react' {
  function useRef<T = undefined>(): React.RefObject<T | undefined>;
}
