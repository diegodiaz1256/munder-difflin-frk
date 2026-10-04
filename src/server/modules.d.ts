declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';
  const TestRenderer: { create(el: ReactElement): { unmount(): void } };
  export default TestRenderer;
}
