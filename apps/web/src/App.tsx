import { Link, Route, Routes } from "react-router-dom";
import { StubPage } from "./routes/StubPage.js";
import { Dashboard } from "./routes/Dashboard.js";
import { Cash } from "./routes/Cash.js";

const NAV_ROUTES = [
  { path: "/", title: "Dashboard", element: <Dashboard /> },
  { path: "/cash", title: "Cash", element: <Cash /> },
  { path: "/debt", title: "Debt" },
  { path: "/investments", title: "Investments" },
  { path: "/assets", title: "Assets" },
  { path: "/income", title: "Income" },
  { path: "/expenses", title: "Expenses" },
  { path: "/settings", title: "Settings" },
  { path: "/import", title: "Import" },
];

export function App() {
  return (
    <>
      <nav>
        <ul>
          {NAV_ROUTES.map((route) => (
            <li key={route.path}>
              <Link to={route.path}>{route.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <Routes>
        {NAV_ROUTES.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={route.element ?? <StubPage title={route.title} />}
          />
        ))}
      </Routes>
    </>
  );
}
