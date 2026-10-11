import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ChildForm } from './components/ChildForm.tsx';
import { Dragon } from './components/Dragon.tsx';
import { AppProvider, useApp } from './lib/app-state.tsx';
import { StepUpProvider } from './lib/step-up.tsx';
import { KidHome } from './pages/kids/KidHome.tsx';
import { KidsPicker } from './pages/kids/KidsPicker.tsx';
import { Lesson } from './pages/kids/Lesson.tsx';
import { Tutor } from './pages/kids/Tutor.tsx';
import { ParentHome } from './pages/ParentHome.tsx';
import { Plan } from './pages/Plan.tsx';
import { Setup } from './pages/Setup.tsx';
import { SignIn } from './pages/SignIn.tsx';

/** Where a visitor belongs right now, given sign-in, setup and child mode. */
function home(app: ReturnType<typeof useApp>): string {
  if (!app.session) return '/signin';
  if (!app.family || !app.hasCoreConsent || app.children.length === 0) return '/setup';
  if (app.activeChild) return '/kids/home';
  return '/parent';
}

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <Dragon size={96} />
    </div>
  );
}

/** Parent screens stay closed while a child is using the device. */
function ParentOnly({ children }: { children: ReactNode }) {
  const app = useApp();
  if (!app.session) return <Navigate to="/signin" replace />;
  if (app.activeChild) return <Navigate to="/kids/home" replace />;
  if (!app.family || app.children.length === 0) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function ChildOnly({ children }: { children: ReactNode }) {
  const app = useApp();
  if (!app.session) return <Navigate to="/signin" replace />;
  if (!app.activeChild) return <Navigate to="/kids" replace />;
  return <>{children}</>;
}

function AddChildPage() {
  const { t } = useApp();
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-3xl">{t('setup.child.title')}</h1>
      <ChildForm onDone={() => navigate('/parent')} />
      <button type="button" className="btn-parent btn-parent-quiet" onClick={() => navigate('/parent')}>
        {t('common.back')}
      </button>
    </main>
  );
}

function Routed() {
  const app = useApp();
  if (!app.ready) return <Loading />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home(app)} replace />} />
      <Route path="/signin" element={app.session ? <Navigate to={home(app)} replace /> : <SignIn />} />
      <Route path="/setup" element={app.session ? (app.activeChild ? <Navigate to="/kids/home" replace /> : <Setup />) : <Navigate to="/signin" replace />} />
      <Route path="/parent" element={<ParentOnly><ParentHome /></ParentOnly>} />
      <Route path="/parent/add-child" element={<ParentOnly><AddChildPage /></ParentOnly>} />
      <Route path="/parent/plan" element={<ParentOnly><Plan /></ParentOnly>} />
      <Route path="/kids" element={app.activeChild ? <Navigate to="/kids/home" replace /> : <ParentOnly><KidsPicker /></ParentOnly>} />
      <Route path="/kids/home" element={<ChildOnly><KidHome /></ChildOnly>} />
      <Route path="/kids/lesson/:id" element={<ChildOnly><Lesson /></ChildOnly>} />
      <Route path="/kids/tutor" element={app.tutorAvailable ? <ChildOnly><Tutor /></ChildOnly> : <Navigate to="/kids/home" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <StepUpProvider>
          <Routed />
        </StepUpProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
