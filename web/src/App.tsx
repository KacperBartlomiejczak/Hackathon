import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AlertsProvider } from "@/components/AlertsProvider";
import Layout from "@/components/Layout";

// Pages load on demand so recharts (Trends only) stays out of the main chunk.
const CalibrationPage = lazy(() => import("@/pages/CalibrationPage"));
const FindingsPage = lazy(() => import("@/pages/FindingsPage"));
const FindingDetailsPage = lazy(() => import("@/pages/FindingDetailsPage"));
const SourcesPage = lazy(() => import("@/pages/SourcesPage"));
const TrendsPage = lazy(() => import("@/pages/TrendsPage"));

export default function App() {
  return (
    <AlertsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/findings" replace />} />
            <Route path="findings" element={<FindingsPage />} />
            <Route path="findings/:id" element={<FindingDetailsPage />} />
            <Route path="trends" element={<TrendsPage />} />
            <Route path="calibration" element={<CalibrationPage />} />
            <Route path="sources" element={<SourcesPage />} />
          </Route>
        </Routes>
    </AlertsProvider>
  );
}
