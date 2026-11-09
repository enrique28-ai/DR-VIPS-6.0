import { createContext } from "react";

// Inside PrivateRoute, the outer boundary owns visibility during validation.
export const ProtectedRouteContext = createContext(false);
