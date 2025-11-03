// Mock for react-router-dom to avoid ES module issues in tests
import React from 'react';

export const BrowserRouter = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

export const Routes = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

export const Route = ({ element }: { element: React.ReactNode; path?: string }) => (
  <div>{element}</div>
);

export const Link = ({ children, to }: { children: React.ReactNode; to: string }) => (
  <a href={to}>{children}</a>
);

export const Navigate = ({ to }: { to: string }) => <div data-testid={`navigate-${to}`} />;

export const useNavigate = () => jest.fn();
export const useLocation = () => ({ pathname: '/' });
export const useParams = () => ({});
export const useSearchParams = () => {
  const searchParams = new URLSearchParams();
  const setSearchParams = jest.fn();
  return [searchParams, setSearchParams];
};
