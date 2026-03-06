import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { AnalyzerPage } from "./components/AnalyzerPage";
import { ResultsPage } from "./components/ResultsPage";
import { ComparePage } from "./components/ComparePage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: AnalyzerPage },
      { path: "results", Component: ResultsPage },
      { path: "compare", Component: ComparePage },
    ],
  },
]);
