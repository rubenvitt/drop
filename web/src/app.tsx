import { Routes, Route } from "react-router";
import { LoginPage } from "@/pages/login-page";
import { UploadPage } from "@/pages/upload-page";
import { AdminPage } from "@/pages/admin-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<UploadPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/u/:token" element={<UploadPage />} />
    </Routes>
  );
}
