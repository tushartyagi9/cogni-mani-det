import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { AnalyzerPage } from "./components/AnalyzerPage";
import { ResultsPage } from "./components/ResultsPage";
import { ComparePage } from "./components/ComparePage";
import { NotFoundPage } from "./components/NotFoundPage";
import AdminEvaluationPage from "./components/admin/AdminEvaluationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: AnalyzerPage },
      { path: "results", Component: ResultsPage },
      { path: "compare", Component: ComparePage },
      { path: "*", Component: NotFoundPage },
    ],
  },
  // Internal admin page — no public navigation link
  { path: "/admin/evaluation", Component: AdminEvaluationPage },
  { path: "*", Component: NotFoundPage },
]);
