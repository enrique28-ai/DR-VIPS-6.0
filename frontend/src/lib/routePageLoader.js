export class RoutePageLoadError extends Error {
  constructor() {
    super("Route page could not be loaded");
  }
}

// Only rejected module loads get recovery UI; page render errors still propagate.
export const loadRoutePage = (modulePromise) =>
  modulePromise.catch(() => {
    throw new RoutePageLoadError();
  });
