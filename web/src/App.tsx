import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AlertsProvider } from "@/components/AlertsProvider";
import Layout from "@/components/Layout";

const CalibrationPage = lazy(() => import("@/pages/CalibrationPage"));
const FindingsPage = lazy(() => import("@/pages/FindingsPage"));
const FindingDetailsPage = lazy(() => import("@/pages/FindingDetailsPage"));
const SourcesPage = lazy(() => import("@/pages/SourcesPage"));
const TrendsPage = lazy(() => import("@/pages/TrendsPage"));

export default function App() {
  return (
    <AlertsProvider>
      <Suspense fallback={<p className="p-6 text-sm text-slate-500">Ładowanie…</p>}>
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
      </Suspense>
    </AlertsProvider>
  );
}
