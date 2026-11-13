import { Route, Routes } from 'react-router';
import { ExperienceGate } from './components/onboarding/ExperienceGate';

export default function App() {
  return (
    <div className="apple-bg-main min-h-screen">
      <Routes>
        <Route path="*" element={<ExperienceGate />} />
      </Routes>
    </div>
  );
}
