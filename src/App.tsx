import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Button, ToastProvider, Icon, IconButton } from './ui';
import { ChatView } from './views/Chat';
import { SettingsView } from './views/Settings';
import { ProjectsView } from './views/Projects';
import { ScriptView } from './views/Script';
import { ScenesView } from './views/Scenes';
import { EditView } from './views/Edit';
import { PublishView } from './views/Publish';
import { InsightsView } from './views/Insights';
import { initAnalytics } from './lib/analytics';
import type { View } from './types';

type Route = View | 'insights' | 'settings' | 'chat';

const NAV: { id: View; label: string; icon: 'layers' | 'script' | 'image' | 'film' | 'send' }[] = [
  { id: 'projects', label: 'المشاريع', icon: 'layers' },
  { id: 'script', label: 'السكريبت', icon: 'script' },
  { id: 'scenes', label: 'المشاهد', icon: 'image' },
  { id: 'edit', label: 'المونتاج', icon: 'film' },
  { id: 'publish', label: 'النشر', icon: 'send' },
];

const TITLES: Record<Route, string> = {
  chat: 'المساعد',
  projects: 'المشاريع',
  script: 'السكريبت',
  scenes: 'المشاهد',
  edit: 'المونتاج',
  publish: 'النشر',
  insights: 'الأحداث',
  settings: 'الإعدادات',
};

function Shell() {
  const { project } = useStore();
  const [route, setRoute] = useState<Route>('chat');

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (route !== 'chat') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.title = `${TITLES[route]} — مشهد`;
  }, [route]);

  const go = (view: View) => setRoute(view);

  const navItems = NAV.map((item) => ({
    ...item,
    disabled: item.id !== 'projects' && !project,
  }));

  if (route === 'chat') {
    return (
      <div className="app app--chat">
        <header className="chatbar">
          <span className="brand__mark">
            <Icon name="film" size={18} />
          </span>
          <div className="chatbar__text">
            <strong className="brand__name">مشهد</strong>
            <span className="small muted">مساعد الفيديو</span>
          </div>
          <div className="chatbar__actions">
            {project ? (
              <Button size="sm" icon="film" aria-label="تحرير يدوي" onClick={() => setRoute('edit')}>
                تحرير يدوي
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="quiet"
              icon="layers"
              aria-label="الاستوديو"
              onClick={() => setRoute('projects')}
            >
              الاستوديو
            </Button>
            <IconButton icon="gear" label="الإعدادات" onClick={() => setRoute('settings')} />
            <IconButton icon="chart" label="الأحداث" onClick={() => setRoute('insights')} />
          </div>
        </header>
        <ChatView onOpen={go} />
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="film" size={20} />
          </span>
          <div>
            <div className="brand__name">مشهد</div>
            <div className="brand__tag">استوديو السلسلات القصيرة</div>
          </div>
        </div>

        <nav className="nav" aria-label="التنقل الرئيسي">
          <button
            type="button"
            className="navitem"
            onClick={() => setRoute('chat')}
          >
            <Icon name="sparkles" size={18} />
            المساعد
          </button>
          <span className="nav__label">المشروع</span>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navitem ${route === item.id ? 'is-active' : ''}`}
              onClick={() => setRoute(item.id)}
              disabled={item.disabled}
              aria-current={route === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
              {route === item.id ? <span className="navitem__dot" /> : null}
            </button>
          ))}
          <button
            type="button"
            className={`navitem ${route === 'insights' ? 'is-active' : ''}`}
            onClick={() => setRoute('insights')}
            aria-current={route === 'insights' ? 'page' : undefined}
          >
            <Icon name="chart" size={18} />
            الأحداث
          </button>
          <button
            type="button"
            className={`navitem ${route === 'settings' ? 'is-active' : ''}`}
            onClick={() => setRoute('settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
          >
            <Icon name="gear" size={18} />
            الإعدادات
          </button>
        </nav>

        <div className="rail__foot">
          {project ? (
            <div className="rail__project">
              <span className="small muted">المشروع الحالي</span>
              <strong>{project.title}</strong>
              <span className="small num">{project.scenes.length} مشاهد</span>
            </div>
          ) : (
            <p className="small">لا مشروع مفتوح — ابدأ من قائمة المشاريع.</p>
          )}
          <p>كل شيء يُحفظ في هذا المتصفح.</p>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <button
            type="button"
            className="brand__mark"
            style={{ width: 30, height: 30, borderRadius: 9, border: 0 }}
            onClick={() => setRoute('chat')}
            aria-label="المساعد"
          >
            <Icon name="film" size={16} />
          </button>
          <span className="brand__name" style={{ fontSize: '1.05rem' }}>
            مشهد
          </span>
          <span className="topbar__title">{project ? project.title : TITLES[route]}</span>
          <IconButton icon="sparkles" label="المساعد" onClick={() => setRoute('chat')} />
          <IconButton icon="gear" label="الإعدادات" onClick={() => setRoute('settings')} />
          <IconButton icon="chart" label="الأحداث" onClick={() => setRoute('insights')} />
        </div>

        <main className="main">
          {route === 'projects' ? <ProjectsView onOpen={go} /> : null}
          {route === 'script' ? <ScriptView onGo={go} /> : null}
          {route === 'scenes' ? <ScenesView onGo={go} /> : null}
          {route === 'edit' ? <EditView onGo={go} /> : null}
          {route === 'publish' ? <PublishView onGo={go} /> : null}
          {route === 'insights' ? <InsightsView /> : null}
          {route === 'settings' ? <SettingsView /> : null}
        </main>

        <nav className="bottomnav" aria-label="التنقل السفلي">
          <div className="bottomnav__inner">
            <button type="button" onClick={() => setRoute('chat')}>
              <Icon name="sparkles" size={19} />
              المساعد
            </button>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={route === item.id ? 'is-active' : ''}
                onClick={() => setRoute(item.id)}
                disabled={item.disabled}
                aria-current={route === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
