import { Navigate, Route, Routes } from "react-router-dom";
import { AlertsProvider } from "@/components/AlertsProvider";
import Layout from "@/components/Layout";
import CalibrationPage from "@/pages/CalibrationPage";
import FindingsPage from "@/pages/FindingsPage";
import FindingDetailsPage from "@/pages/FindingDetailsPage";
import SourcesPage from "@/pages/SourcesPage";
import TrendsPage from "@/pages/TrendsPage";

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
