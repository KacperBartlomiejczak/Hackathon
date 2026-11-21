import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import FindingsPage from "@/pages/FindingsPage";
import FindingDetailsPage from "@/pages/FindingDetailsPage";
import Placeholder from "@/pages/Placeholder";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/findings" replace />} />
        <Route path="findings" element={<FindingsPage />} />
        <Route path="findings/:id" element={<FindingDetailsPage />} />
        <Route path="trends" element={<Placeholder title="Trendy" />} />
        <Route path="calibration" element={<Placeholder title="Kalibracja" />} />
        <Route path="sources" element={<Placeholder title="Źródła" />} />
      </Route>
    </Routes>
  );
}
