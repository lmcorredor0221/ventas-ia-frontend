import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  Database,
  Eye,
  FileImage,
  Gauge,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListChecks,
  ListFilter,
  Lock,
  MessageCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  conversations,
  eventTemplates,
  metricSeed,
  pendingRequests,
  storeZones,
  tenants,
  tools,
} from './data/acpModel.js';

const statusLabel = {
  defined: 'Definido',
  needs_binding: 'Conexión pendiente',
  sandbox_ready: 'Listo para operar',
  production_ready: 'Producción',
  live: 'En curso',
  degraded: 'Degradado',
  blocked: 'Bloqueado',
  fallback_available: 'Fallback',
  approval_required: 'Aprobación',
  resolved: 'Resuelto',
};

const statusIcon = {
  live: Activity,
  approval_required: UserCheck,
  blocked: AlertTriangle,
  degraded: Clock3,
  needs_binding: PlugZap,
  sandbox_ready: ShieldCheck,
  resolved: BadgeCheck,
};

const zoneIcon = {
  entry: MessageCircle,
  agent: Bot,
  tool: Database,
  memory: ShoppingBag,
  approval: UserCheck,
  write: CircleDollarSign,
  event: Activity,
};

const navigationItems = [
  ['summary', LayoutDashboard, 'Resumen'],
  ['store', Store, 'Tienda viva'],
  ['conversations', MessageSquareText, 'Conversaciones'],
  ['onboarding', ShieldCheck, 'Onboarding'],
  ['admin', Gauge, 'Centro de control'],
  ['observability', Activity, 'Observabilidad'],
  ['approvals', ListChecks, 'Aprobaciones'],
  ['analytics', BarChart3, 'Analítica'],
  ['config', Settings2, 'Configuración'],
];

const viewHeader = {
  summary: ['Centro multicliente', 'Resumen operativo'],
  store: ['Tienda viva', 'Operación comercial en tiempo real'],
  conversations: ['Atención comercial', 'Conversaciones supervisables'],
  onboarding: ['Activación guiada', 'Puesta en marcha de la tienda'],
  admin: ['Centro de control', 'Salud comercial de la plataforma'],
  observability: ['Observabilidad', 'Eventos de conexión e integraciones'],
  approvals: ['Apoyo humano', 'Bandeja de decisiones'],
  analytics: ['Analítica', 'Uso y desempeño operativo'],
  config: ['Configuración', 'Parámetros de la tienda'],
};

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function apiUrl(input) {
  if (typeof input !== 'string' || !apiBaseUrl) return input;
  if (input.startsWith('/api') || input.startsWith('/webhooks') || input.startsWith('/health')) return `${apiBaseUrl}${input}`;
  return input;
}

function appFetch(input, init) {
  return fetch(apiUrl(input), init);
}

function zoneCenter(zoneId) {
  const zone = storeZones.find((item) => item.id === zoneId) ?? storeZones[0];
  return {
    x: zone.x + zone.w / 2,
    y: zone.y + zone.h / 2,
  };
}

function formatTime(offsetSeconds = 0) {
  const date = new Date(Date.now() - offsetSeconds * 1000);
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function createEvent(index, tenantId, conversation) {
  const type = eventTemplates[index % eventTemplates.length];
  const tool = conversation?.lastTool ?? 'planner';
  return {
    id: `evt-${Date.now()}-${index}`,
    at: formatTime(index * 17),
    type,
    tenantId,
    conversationId: conversation?.id ?? 'system',
    detail:
      type === 'approval.requested'
        ? 'Solicitud humana creada desde aprobación operativa'
        : type === 'fallback.activated'
          ? 'Ruta alternativa registrada sin ejecutar acciones reales'
          : `${toolLabel(tool)} registró ${eventTypeLabel(type)}`,
  };
}

function csrfHeaders(auth) {
  const token = auth?.session?.csrfToken;
  return token ? { 'x-csrf-token': token } : {};
}

function App() {
  const [tenantList, setTenantList] = useState(tenants);
  const [toolList, setToolList] = useState(tools);
  const [conversationList, setConversationList] = useState(conversations);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [tenantId, setTenantId] = useState(tenants[0].id);
  const [activeView, setActiveView] = useState('summary');
  const [selectedId, setSelectedId] = useState(conversations[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversationQuery, setConversationQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isPlaying, setIsPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const [events, setEvents] = useState(() =>
    conversations.slice(0, 5).map((conversation, index) => createEvent(index, conversation.tenantId, conversation)),
  );
  const [requests, setRequests] = useState(pendingRequests);
  const [draftReply, setDraftReply] = useState('Producto identificado. Continuar con cotización preliminar.');
  const [auth, setAuth] = useState(null);
  const [authStatus, setAuthStatus] = useState('checking');
  const [authRequired, setAuthRequired] = useState(false);
  const [authError, setAuthError] = useState('');
  const [usageSummary, setUsageSummary] = useState(() => defaultUsageSummary(tenants[0].id));
  const [onboardingBundle, setOnboardingBundle] = useState(null);
  const [onboardingBusy, setOnboardingBusy] = useState('');
  const [onboardingError, setOnboardingError] = useState('');
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminError, setAdminError] = useState('');
  const [billingStatus, setBillingStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [storeCaseOpen, setStoreCaseOpen] = useState(false);

  const tenant = tenantList.find((item) => item.id === tenantId) ?? tenantList[0] ?? tenants[0];
  const visibleConversations = conversationList.filter((item) => item.tenantId === tenantId);
  const selectedConversation =
    visibleConversations.find((item) => item.id === selectedId) ?? visibleConversations[0] ?? conversationList[0] ?? conversations[0];
  const visibleRequests = requests.filter((item) => item.tenantId === tenantId);
  const visibleEvents = events.filter((item) => item.tenantId === tenantId).slice(0, 9);
  const pendingIds = useMemo(() => new Set(visibleRequests.map((item) => item.conversationId)), [visibleRequests]);
  const [headerEyebrow, headerTitle] = viewHeader[activeView] ?? viewHeader.summary;

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const response = await appFetch('/api/auth/me', { credentials: 'include' });
        if (!response.ok) {
          if (!cancelled) {
            setAuth(null);
            setAuthStatus('guest');
          }
          return;
        }
        const session = await response.json();
        if (!cancelled) {
          setAuth(session);
          setAuthStatus('signed_in');
          setAuthRequired(false);
          setAuthError('');
          if (session.memberships?.[0]?.tenantId) setTenantId(session.memberships[0].tenantId);
        }
      } catch {
        if (!cancelled) setAuthStatus('guest');
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await appFetch(`/api/ops/overview?tenantId=${encodeURIComponent(tenantId)}`, { credentials: 'include' });
        if (response.status === 401) {
          setAuthRequired(true);
          setBackendStatus('auth_required');
          return;
        }
        if (response.status === 403 && auth?.memberships?.[0]?.tenantId) {
          setTenantId(auth.memberships[0].tenantId);
          return;
        }
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const overview = await response.json();
        if (cancelled) return;
        setTenantList(overview.tenants?.length ? overview.tenants : tenants);
        setToolList(overview.tools?.length ? overview.tools : tools);
        setConversationList(overview.conversations?.length ? overview.conversations : conversations);
        setRequests(overview.pendingRequests ?? []);
        setEvents(overview.events ?? []);
        setUsageSummary(overview.usage ?? defaultUsageSummary(tenantId));
        const statusResponse = await appFetch(`/api/saas/tenants/${encodeURIComponent(tenantId)}/status`, { credentials: 'include' });
        if (!cancelled && statusResponse.ok) {
          setOnboardingBundle(await statusResponse.json());
        } else if (!cancelled) {
          setOnboardingBundle(null);
        }
        const billingResponse = await appFetch(`/api/billing/status?tenantId=${encodeURIComponent(tenantId)}`, { credentials: 'include' });
        if (!cancelled && billingResponse.ok) {
          setBillingStatus(await billingResponse.json());
        } else if (!cancelled) {
          setBillingStatus(null);
        }
        const adminResponse = await appFetch('/api/admin/overview', { credentials: 'include' });
        if (!cancelled && adminResponse.ok) {
          setAdminOverview(await adminResponse.json());
          setAdminError('');
        } else if (!cancelled && adminResponse.status !== 403 && adminResponse.status !== 401) {
          setAdminOverview(null);
          setAdminError(`Admin ${adminResponse.status}`);
        }
        setBackendStatus('connected');
      } catch {
        if (!cancelled) {
          setUsageSummary(defaultUsageSummary(tenantId));
          setOnboardingBundle(null);
          setBillingStatus(null);
          setAdminOverview(null);
          setBackendStatus('offline');
        }
      }
    }

    loadOverview();
    const timer = window.setInterval(loadOverview, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tenantId, auth, refreshKey]);

  useEffect(() => {
    if (!visibleConversations.find((item) => item.id === selectedId) && visibleConversations[0]) {
      setSelectedId(visibleConversations[0].id);
    }
  }, [tenantId, selectedId, visibleConversations]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
      setEvents((current) => {
        const pool = conversationList.filter((item) => item.tenantId === tenantId);
        const conversation = pool[Math.floor(Math.random() * Math.max(pool.length, 1))];
        if (backendStatus === 'connected') return current;
        return [createEvent(current.length, tenantId, conversation), ...current].slice(0, 36);
      });
    }, 2300);
    return () => window.clearInterval(timer);
  }, [isPlaying, tenantId, conversationList, backendStatus]);

  const metrics = useMemo(() => {
    const active = visibleConversations.filter((item) => ['live', 'degraded'].includes(item.status)).length;
    const pending = visibleRequests.length;
    const blocked = visibleConversations.filter((item) => item.status === 'blocked').length;
    const binding = toolList.filter((item) => item.status === 'needs_binding').length;
    return {
      ...metricSeed,
      active: active + 14,
      pending,
      failed: blocked + 1,
      binding,
    };
  }, [visibleConversations, visibleRequests, toolList]);

  const filteredConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase();
    return visibleConversations.filter((conversation) => {
      const matchesQuery = !query
        || conversation.customer.toLowerCase().includes(query)
        || conversation.id.toLowerCase().includes(query)
        || conversation.need.toLowerCase().includes(query)
        || conversation.lastTool.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || conversation.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [conversationQuery, statusFilter, visibleConversations]);

  function focusConversation(id, nextView = activeView) {
    setSelectedId(id);
    setActiveView(nextView);
    if (nextView === 'store') setStoreCaseOpen(true);
  }

  async function updateTenantConfig(configPatch) {
    try {
      const response = await appFetch(`/api/tenants/${encodeURIComponent(tenantId)}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
        credentials: 'include',
        body: JSON.stringify(configPatch),
      });
      if (!response.ok) throw new Error(`Config update ${response.status}`);
      const updatedTenant = await response.json();
      setTenantList((current) => current.map((item) => (item.id === updatedTenant.id ? updatedTenant : item)));
      setBackendStatus('connected');
      setRefreshKey((value) => value + 1);
    } catch {
      setBackendStatus('offline');
    }
  }

  async function runOnboardingAction(action) {
    setOnboardingError('');
    if (action === 'config-whatsapp') {
      setActiveView('config');
      return;
    }
    if (action === 'config-llm') {
      setActiveView('admin');
      return;
    }
    const postRoutes = {
      subscription: `/api/saas/tenants/${encodeURIComponent(tenantId)}/subscription/mock-activate`,
      'billing-checkout': '/api/billing/checkout',
      'billing-continue': '/api/billing/continue-checkout',
      'billing-cancel': '/api/billing/cancel',
      provision: `/api/saas/tenants/${encodeURIComponent(tenantId)}/google/provision`,
      validate: `/api/saas/tenants/${encodeURIComponent(tenantId)}/validate`,
      activate: `/api/saas/tenants/${encodeURIComponent(tenantId)}/activate`,
    };
    setOnboardingBusy(action);
    try {
      if (action === 'google-oauth') {
        const response = await appFetch(`/api/saas/tenants/${encodeURIComponent(tenantId)}/google/oauth/start`, { credentials: 'include' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `OAuth ${response.status}`);
        if (result.authorizationUrl) window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer');
      } else {
        if (!postRoutes[action]) throw new Error(`Acción no configurada: ${action}`);
        const body = ['billing-checkout', 'billing-continue', 'billing-cancel'].includes(action)
          ? { tenantId, payerEmail: tenant.lifecycle?.ownerEmail, reason: action === 'billing-cancel' ? 'owner_requested' : undefined }
          : {};
        const response = await appFetch(postRoutes[action], {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? `Acción ${response.status}`);
        if (result.status) setOnboardingBundle(result);
        if (result.subscription || result.plan || result.payments) setRefreshKey((value) => value + 1);
      }
      setBackendStatus('connected');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBackendStatus((current) => (current === 'offline' ? current : 'connected'));
      setOnboardingError(error.message);
    } finally {
      setOnboardingBusy('');
    }
  }

  async function runWhatsAppOnboarding(action, payload = {}) {
    setOnboardingError('');
    const routes = {
      intent: `/api/saas/tenants/${encodeURIComponent(tenantId)}/whatsapp/intent`,
      start: `/api/saas/tenants/${encodeURIComponent(tenantId)}/whatsapp/embedded-signup/start`,
      binding: `/api/saas/tenants/${encodeURIComponent(tenantId)}/whatsapp/binding`,
    };
    setOnboardingBusy(`whatsapp-${action}`);
    try {
      if (!routes[action]) throw new Error(`Acción WhatsApp no configurada: ${action}`);
      const response = await appFetch(routes[action], {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? `WhatsApp ${response.status}`);
      if (action === 'start' && result.launch?.authorizationUrl) {
        window.open(result.launch.authorizationUrl, '_blank', 'noopener,noreferrer');
      }
      setRefreshKey((value) => value + 1);
      const statusResponse = await appFetch(`/api/saas/tenants/${encodeURIComponent(tenantId)}/status`, { credentials: 'include' });
      if (statusResponse.ok) setOnboardingBundle(await statusResponse.json());
      return result;
    } catch (error) {
      setOnboardingError(error.message);
      return null;
    } finally {
      setOnboardingBusy('');
    }
  }

  async function updatePlatformSettings(settingsPatch) {
    setAdminError('');
    try {
      const response = await appFetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
        credentials: 'include',
        body: JSON.stringify(settingsPatch),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? `Admin ${response.status}`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setAdminError(error.message);
    }
  }

  async function resolveRequest(id, outcome) {
    const request = requests.find((item) => item.id === id);
    try {
      if (backendStatus === 'connected') {
        await appFetch(`/api/pending-requests/${encodeURIComponent(id)}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
          credentials: 'include',
          body: JSON.stringify({ outcome, note: draftReply, approverId: 'micro-app-user' }),
        });
        const response = await appFetch(`/api/ops/overview?tenantId=${encodeURIComponent(tenantId)}`, { credentials: 'include' });
        const overview = await response.json();
        setConversationList(overview.conversations ?? conversationList);
        setRequests(overview.pendingRequests ?? []);
        setEvents(overview.events ?? []);
        setUsageSummary(overview.usage ?? defaultUsageSummary(tenantId));
        return;
      }
    } catch {
      setBackendStatus('offline');
    }
    setRequests((current) => current.filter((item) => item.id !== id));
    setEvents((current) => [
      {
        id: `evt-${Date.now()}-${outcome}`,
        at: formatTime(),
        type: outcome === 'approved' ? 'approval.granted' : 'approval.denied',
        tenantId,
        conversationId: request?.conversationId ?? 'system',
        detail: outcome === 'approved' ? 'Intervención humana resuelta y flujo reanudado' : 'Operación rechazada por usuario humano',
      },
      ...current,
    ]);
  }

  async function handleGoogleCredential(idToken) {
    setAuthStatus('checking');
    setAuthError('');
    try {
      const response = await appFetch('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error ?? `Login ${response.status}`);
      applySession(session);
    } catch (error) {
      setAuthStatus('guest');
      setAuthError(error.message);
    }
  }

  async function handleSandboxLogin() {
    setAuthStatus('checking');
    setAuthError('');
    try {
      const response = await appFetch('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idToken: 'dev-google-id-token',
          profile: {
            sub: `dev-${tenantId}`,
            email: `${tenantId}@example.local`,
            name: tenant.name,
          },
        }),
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error ?? `Login ${response.status}`);
      applySession(session);
    } catch (error) {
      setAuthStatus('guest');
      setAuthError(error.message);
    }
  }

  function applySession(session) {
    setAuth(session);
    setAuthStatus('signed_in');
    setAuthRequired(false);
    setAuthError('');
    if (session.memberships?.[0]?.tenantId) setTenantId(session.memberships[0].tenantId);
  }

  async function handleLogout() {
    await appFetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(auth),
    }).catch(() => {});
    setAuth(null);
    setAuthStatus('guest');
  }

  if (authRequired && !auth?.user) {
    return (
      <AuthGate
        authError={authError}
        authStatus={authStatus}
        onGoogleCredential={handleGoogleCredential}
        onSandboxLogin={handleSandboxLogin}
      />
    );
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Navegación principal">
        <div className="brand-block">
          <div className="brand-mark">
            <Store size={22} />
          </div>
          <div>
            <span className="eyebrow">Ventas IA</span>
            <strong>Ops Store</strong>
          </div>
          <button
            aria-label={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <label className="tenant-picker">
          <span>Cliente activo</span>
          <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
            {tenantList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <nav className="nav-stack">
          {navigationItems.map(([key, Icon, label]) => (
            <button
              className={activeView === key ? 'nav-item is-active' : 'nav-item'}
              key={key}
              onClick={() => setActiveView(key)}
              type="button"
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="tenant-card" style={{ '--tenant-accent': tenant.accent }}>
          <div className="tenant-ring">
            <Building2 size={20} />
          </div>
          <h2>{tenant.name}</h2>
          <p>{tenant.industry}</p>
          <div className="mini-row">
            <span>{planLabel(tenant.plan)}</span>
            <StatusPill status={tenant.status} />
          </div>
        </div>
      </aside>

      <section className={`workspace ${activeView === 'store' ? 'workspace-compact' : ''}`}>
        <header className="topbar">
          <div>
            <span className="eyebrow">{headerEyebrow}</span>
            <h1>{headerTitle}</h1>
          </div>
          <div className="top-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                aria-label="Buscar conversación"
                onChange={(event) => setConversationQuery(event.target.value)}
                placeholder="Buscar cliente, ID o herramienta"
                value={conversationQuery}
              />
            </label>
            <button className="icon-btn" type="button" title={`${visibleRequests.length} aprobaciones pendientes`}>
              <Bell size={18} />
              {visibleRequests.length > 0 && <span>{visibleRequests.length}</span>}
            </button>
            <button className="icon-btn" type="button" title={isPlaying ? 'Pausar eventos' : 'Reproducir eventos'} onClick={() => setIsPlaying((value) => !value)}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="ghost-btn" type="button">
              <ShieldCheck size={17} />
              {backendStatus === 'connected' ? 'Backend conectado' : 'Modo local'}
            </button>
            <AuthBadge
              auth={auth}
              authStatus={authStatus}
              onGoogleCredential={handleGoogleCredential}
              onLogout={handleLogout}
              onSandboxLogin={handleSandboxLogin}
            />
          </div>
        </header>

        <section className="metric-strip" aria-label="Indicadores operativos">
          <Metric icon={Activity} label="Activas" value={metrics.active} tone="green" />
          <Metric icon={UserCheck} label="Requiere apoyo" value={metrics.pending} tone="gold" />
          <Metric icon={PlugZap} label="Conexiones pendientes" value={metrics.binding} tone="red" />
          <Metric icon={Gauge} label="Primera respuesta" value={metrics.response} tone="mint" />
          <Metric icon={ShoppingBag} label="Domicilios del plan" value={formatUsageRatio(usageSummary.metrics.deliveries_confirmed, usageSummary.limits.includedDeliveries)} tone="ink" />
        </section>

        {activeView === 'summary' && (
          <SummaryView
            conversations={visibleConversations}
            events={visibleEvents}
            metrics={metrics}
            onNavigate={setActiveView}
            onSelectConversation={focusConversation}
            requests={visibleRequests}
            tools={toolList}
            usage={usageSummary}
          />
        )}

        {activeView === 'store' && (
          <section className="main-grid store-grid-full">
            <StoreMap
              conversations={visibleConversations}
              selectedId={selectedConversation?.id}
              onOpenList={() => setActiveView('conversations')}
              onReset={() => {
                setSelectedId(visibleConversations[0]?.id);
                setStoreCaseOpen(false);
              }}
              onSelect={(id) => focusConversation(id, 'store')}
              tick={tick}
              pendingIds={pendingIds}
            />
            {storeCaseOpen && selectedConversation && (
              <ConversationPanel
                conversation={selectedConversation}
                events={visibleEvents}
                onClose={() => setStoreCaseOpen(false)}
                onOpenApprovals={() => setActiveView('approvals')}
                onOpenList={() => setActiveView('conversations')}
                pendingRequest={visibleRequests.find((request) => request.conversationId === selectedConversation.id)}
              />
            )}
          </section>
        )}

        {activeView === 'conversations' && (
          <ConversationsView
            conversations={filteredConversations}
            events={visibleEvents}
            onSelectConversation={(id) => focusConversation(id, 'store')}
            query={conversationQuery}
            selectedId={selectedConversation?.id}
            setQuery={setConversationQuery}
            setStatusFilter={setStatusFilter}
            statusFilter={statusFilter}
          />
        )}

        {activeView === 'approvals' && (
          <HumanQueue
            requests={visibleRequests}
            conversations={visibleConversations}
            onSelectConversation={(id) => focusConversation(id, 'store')}
            onResolve={resolveRequest}
            draftReply={draftReply}
            setDraftReply={setDraftReply}
          />
        )}

        {activeView === 'onboarding' && (
          <OnboardingView
            bundle={onboardingBundle}
            billingStatus={billingStatus}
            busyAction={onboardingBusy}
            error={onboardingError}
            onAction={runOnboardingAction}
            onWhatsAppAction={runWhatsAppOnboarding}
            onNavigate={setActiveView}
            tenant={tenant}
          />
        )}

        {activeView === 'admin' && (
          <PlatformAdminView
            auth={auth}
            error={adminError}
            overview={adminOverview}
            onSaveSettings={updatePlatformSettings}
            onOpenObservability={() => setActiveView('observability')}
          />
        )}

        {activeView === 'observability' && (
          <ObservabilityView overview={adminOverview} />
        )}

        {activeView === 'analytics' && (
          <AnalyticsView conversations={visibleConversations} events={visibleEvents} requests={visibleRequests} tools={toolList} usage={usageSummary} />
        )}

        {activeView === 'config' && <Configuration onSaveConfig={updateTenantConfig} tenant={tenant} tools={toolList} />}
      </section>
    </main>
  );
}

function StatusPill({ status }) {
  const Icon = statusIcon[status] ?? Layers3;
  return (
    <span className={`status-pill status-${status}`}>
      <Icon size={13} />
      {statusLabel[status] ?? status}
    </span>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <article className={`metric metric-${tone}`}>
      <Icon size={19} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function defaultUsageSummary(tenantId) {
  return {
    tenantId,
    period: new Date().toISOString().slice(0, 7),
    planCode: 'ventas_ia_1000_domicilios',
    limits: {
      includedDeliveries: 1000,
      includedInteractions: 5000,
      includedLlmTokens: null,
    },
    metrics: {
      agent_interactions: 0,
      deliveries_confirmed: 0,
      tool_calls: 0,
      llm_calls: 0,
      llm_prompt_tokens: 0,
      llm_completion_tokens: 0,
      llm_total_tokens: 0,
    },
    percentages: {
      interactions: 0,
      deliveries: 0,
      llmTokens: null,
    },
    status: 'ok',
    counters: {},
  };
}

function formatUsageRatio(value, limit) {
  if (!limit) return formatCompactNumber(value);
  return `${formatCompactNumber(value)}/${formatCompactNumber(limit)}`;
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('es-CO', { notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

function formatCurrency(value, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDateShort(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function initials(value = '') {
  const text = String(value).trim();
  if (!text) return 'IA';
  const [namePart] = text.split('@');
  const words = namePart.split(/[\s._-]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'IA';
}

function usageTone(percent) {
  if (percent >= 100) return 'limit';
  if (percent >= 90) return 'danger';
  if (percent >= 80) return 'warn';
  return 'ok';
}

function AuthGate({ authError, authStatus, onGoogleCredential, onSandboxLogin }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark auth-mark">
          <Store size={26} />
        </div>
        <span className="eyebrow">Ventas IA</span>
        <h1>Acceso seguro al centro multicliente</h1>
        <p>Inicia sesión con Google para ver únicamente las tiendas donde tienes membresía activa.</p>
        <GoogleSignInButton onCredential={onGoogleCredential} />
        <button className="ghost-btn auth-dev-btn" type="button" onClick={onSandboxLogin} disabled={authStatus === 'checking'}>
          <ShieldCheck size={17} />
          Usar acceso local de desarrollo
        </button>
        {authError && (
          <div className="auth-error">
            <AlertTriangle size={17} />
            {authError}
          </div>
        )}
      </section>
    </main>
  );
}

function AuthBadge({ auth, authStatus, onGoogleCredential, onLogout, onSandboxLogin }) {
  if (auth?.user) {
    return (
      <div className="auth-badge">
        <span className="avatar-token small">{initials(auth.user.name ?? auth.user.email)}</span>
        <div>
          <strong>{auth.user.name ?? auth.user.email}</strong>
          <span>{auth.memberships?.[0]?.role ?? 'sin rol'}</span>
        </div>
        <button className="icon-btn mini" type="button" onClick={onLogout} title="Cerrar sesión">
          <X size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="auth-actions-inline">
      <GoogleSignInButton compact onCredential={onGoogleCredential} />
      <button className="ghost-btn compact" type="button" onClick={onSandboxLogin} disabled={authStatus === 'checking'}>
        <ShieldCheck size={15} />
        Dev
      </button>
    </div>
  );
}

function GoogleSignInButton({ compact = false, onCredential }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!googleClientId) return undefined;
    let cancelled = false;
    const existing = document.querySelector('script[data-google-identity]');
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      document.head.appendChild(script);
    }
    const handleLoad = () => {
      if (!cancelled) setReady(true);
    };
    if (window.google?.accounts?.id) {
      handleLoad();
    } else {
      script.addEventListener('load', handleLoad);
    }
    return () => {
      cancelled = true;
      script.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!ready || !googleClientId || !containerRef.current || !window.google?.accounts?.id) return;
    containerRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => onCredential(response.credential),
    });
    window.google.accounts.id.renderButton(containerRef.current, {
      theme: 'outline',
      size: compact ? 'medium' : 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: compact ? 150 : 260,
    });
  }, [compact, onCredential, ready]);

  if (!googleClientId) {
    return (
      <button className={compact ? 'ghost-btn compact' : 'approve-btn auth-google-fallback'} type="button" disabled title="Define VITE_GOOGLE_CLIENT_ID para Google Sign-In real">
        <UserCheck size={16} />
        Google
      </button>
    );
  }
  return <div className={compact ? 'google-signin compact' : 'google-signin'} ref={containerRef} />;
}

const characterProfiles = [
  {
    skin: '#d89b72',
    hair: '#3a2b23',
    shirt: '#70c889',
    pants: '#314a61',
    accent: '#f2c15d',
    accessory: 'bag',
    motion: 'curious',
  },
  {
    skin: '#b9785f',
    hair: '#1f1a18',
    shirt: '#e1746b',
    pants: '#2d415b',
    accent: '#86d6e7',
    accessory: 'phone',
    motion: 'waiting',
  },
  {
    skin: '#e0b08c',
    hair: '#6d4430',
    shirt: '#77b8df',
    pants: '#513b63',
    accent: '#f4d17a',
    accessory: 'glasses',
    motion: 'talking',
  },
  {
    skin: '#8f5f4d',
    hair: '#26201d',
    shirt: '#d7a857',
    pants: '#35524a',
    accent: '#ef8b61',
    accessory: 'badge',
    motion: 'steady',
  },
  {
    skin: '#c98b67',
    hair: '#8b5a36',
    shirt: '#cf7fb2',
    pants: '#30445c',
    accent: '#8ee0bd',
    accessory: 'scarf',
    motion: 'curious',
  },
];

const ambientCharacters = [
  { className: 'person-a', role: 'shopper', profile: characterProfiles[0], mood: 'interested', label: 'Cliente observando productos' },
  { className: 'person-b', role: 'shopper', profile: characterProfiles[2], mood: 'waiting', label: 'Cliente esperando respuesta' },
  { className: 'person-c', role: 'supervisor', profile: { ...characterProfiles[3], shirt: '#455b72', accent: '#f0c15d' }, mood: 'steady', label: 'Supervisor humano disponible' },
  { className: 'person-d', role: 'shopper', profile: characterProfiles[4], mood: 'satisfied', label: 'Cliente satisfecho' },
];

function getCharacterProfile(conversation, index) {
  const seed = Array.from(conversation.id).reduce((sum, char) => sum + char.charCodeAt(0), index);
  return characterProfiles[seed % characterProfiles.length];
}

function getCharacterMood(conversation, pendingIds) {
  if (conversation.status === 'approval_required' || pendingIds.has(conversation.id)) return 'waiting';
  if (conversation.status === 'blocked' || conversation.status === 'degraded' || conversation.status === 'needs_binding') return 'confused';
  if (conversation.progress >= 82 || conversation.stage === 'payment') return 'satisfied';
  if (conversation.stage === 'catalog' || conversation.stage === 'quote') return 'interested';
  return 'talking';
}

function CharacterFigure({
  className = '',
  profile,
  role = 'client',
  mood = 'talking',
  label,
  interactive = false,
  selected = false,
  style,
  onClick,
  children,
}) {
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      className={`character-actor ${interactive ? 'avatar iso-avatar' : 'ambient-people'} role-${role} mood-${mood} motion-${profile.motion} ${selected ? 'is-selected' : ''} ${className}`}
      style={{
        '--skin': profile.skin,
        '--hair': profile.hair,
        '--shirt': profile.shirt,
        '--pants': profile.pants,
        '--accent': profile.accent,
        ...style,
      }}
      onClick={onClick}
      type={interactive ? 'button' : undefined}
      title={label}
      aria-label={label}
    >
      <span className="character-shadow" />
      <span className="character-head">
        <span className="hair-cap" />
        <span className="face">
          <span className="eye eye-left" />
          <span className="eye eye-right" />
          <span className="mouth" />
        </span>
        <span className={`character-accessory accessory-${profile.accessory}`} />
      </span>
      <span className="character-body">
        <span className="arm arm-left" />
        <span className="arm arm-right" />
        <span className="torso" />
        <span className="leg leg-left" />
        <span className="leg leg-right" />
      </span>
      {children}
    </Tag>
  );
}

function StoreMap({ conversations, selectedId, onSelect, onOpenList, onReset, tick, pendingIds }) {
  const [showRoutes, setShowRoutes] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pendingCount = conversations.filter((conversation) => pendingIds.has(conversation.id) || conversation.status === 'approval_required').length;

  return (
    <section className="store-map-shell">
      <div className="map-header">
        <div>
          <span className="eyebrow">Tienda viva</span>
          <h2>Operación comercial en tiempo real</h2>
        </div>
        <div className="map-toolbar">
          <div className="legend">
            <span><i className="dot live" /> En curso</span>
            <span><i className="dot approval" /> Requiere apoyo</span>
            <span><i className="dot blocked" /> Bloqueo</span>
          </div>
          <button className="map-chip" type="button" onClick={() => setShowRoutes((value) => !value)}>
            {showRoutes ? 'Rutas visibles' : 'Rutas ocultas'}
          </button>
          <button className="map-chip" type="button" onClick={onOpenList}>
            Vista lista
          </button>
          <button className="map-chip" type="button" onClick={onReset}>
            <RotateCcw size={13} />
            Centrar vista
          </button>
          <button className="map-chip" type="button" onClick={() => setReducedMotion((value) => !value)}>
            {reducedMotion ? 'Movimiento reducido' : 'Animación viva'}
          </button>
        </div>
      </div>

      <div
        className={`store-map iso-store ${showRoutes ? 'show-routes' : 'hide-routes'} ${reducedMotion ? 'reduce-motion' : ''}`}
        role="img"
        aria-label="Tienda isométrica interactiva con conversaciones reales del agente"
      >
        <div className="iso-back-wall">
          <span className="wall-display display-left">Canales</span>
          <span className="wall-display display-center">Catálogo</span>
          <span className="wall-display display-right">Servicio</span>
        </div>
        <div className="iso-side-wall" />
        <div className="floor-grid" />
        <div className="iso-floor-glow" />
        <div className="checkout-belt" />
        <div className="vertical-tools">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className={`intervention-sign ${pendingCount ? 'is-hot' : ''}`}>
          <strong>Requiere apoyo</strong>
          <span>{pendingCount ? `${pendingCount} casos` : 'sin pendientes'}</span>
        </div>

        {storeZones.map((zone) => {
          const Icon = zoneIcon[zone.kind] ?? Store;
          return (
            <button
              className={`zone iso-zone zone-${zone.kind} zone-${zone.id}`}
              key={zone.id}
              style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
              type="button"
              title={`${zone.short} · ${zone.label}`}
            >
              {renderZoneInterior(zone, Icon)}
            </button>
          );
        })}

        <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="route route-main" d="M14 48 C22 43 30 51 36 51 C45 50 50 31 55 28 C64 23 75 27 82 25" />
          <path className="route route-support" d="M36 51 C45 55 54 46 66 46 C76 47 84 58 88 63" />
          <path className="route route-close" d="M63 68 C55 76 48 80 45 80 C35 79 25 76 18 76" />
          <path className="route route-intervention" d="M36 51 C52 60 66 66 88 64" />
        </svg>

        {ambientCharacters.map((person) => (
          <CharacterFigure
            className={person.className}
            key={person.className}
            label={person.label}
            mood={person.mood}
            profile={person.profile}
            role={person.role}
          />
        ))}
        <CharacterFigure
          className="agent-assistant bot-a"
          label="Agente IA atendiendo la conversación"
          mood="talking"
          profile={{ skin: '#cdeaf0', hair: '#3d8394', shirt: '#9ee7f3', pants: '#3f6570', accent: '#f6d674', accessory: 'badge', motion: 'steady' }}
          role="agent"
        >
          <span className="agent-aura"><Bot size={13} /></span>
        </CharacterFigure>
        <CharacterFigure
          className="agent-assistant bot-b"
          label="Agente IA acompañando solicitud de ayuda"
          mood={pendingCount ? 'waiting' : 'talking'}
          profile={{ skin: '#d8f2f5', hair: '#487d8b', shirt: '#b4edf5', pants: '#3c6070', accent: '#ffb25e', accessory: 'badge', motion: 'steady' }}
          role="agent"
        >
          <span className="agent-aura"><Bot size={12} /></span>
        </CharacterFigure>

        {conversations.map((conversation, index) => {
          const currentZoneIndex = Math.min(
            conversation.path.length - 1,
            Math.abs((tick + index) % (conversation.path.length + 2)) >= conversation.path.length
              ? conversation.path.length - 1
              : Math.abs((tick + index) % (conversation.path.length + 2)),
          );
          const currentZone = conversation.status === 'approval_required' || pendingIds.has(conversation.id)
            ? 'approval'
            : conversation.status === 'blocked'
              ? 'approval'
              : conversation.path[currentZoneIndex];
          const center = zoneCenter(currentZone);
          return (
            <CharacterFigure
              className={`avatar-${conversation.status}`}
              key={conversation.id}
              interactive
              label={`${conversation.customer} · ${statusLabel[conversation.status]}`}
              mood={getCharacterMood(conversation, pendingIds)}
              onClick={() => onSelect(conversation.id)}
              profile={getCharacterProfile(conversation, index)}
              role="client"
              selected={selectedId === conversation.id}
              style={{
                left: `calc(${center.x}% + ${(index % 3) * 12 - 12}px)`,
                top: `calc(${center.y}% + ${(index % 2) * 12 - 6}px)`,
                transitionDelay: `${index * 45}ms`,
              }}
            >
              <em className="speech-bubble">{conversation.status === 'approval_required' ? '!' : conversation.status === 'blocked' ? '?' : '...'}</em>
              <span className="character-badge">{conversation.avatar}</span>
              <i className="status-light" />
            </CharacterFigure>
          );
        })}
      </div>
    </section>
  );
}

function renderZoneInterior(zone, Icon) {
  if (zone.id === 'whatsapp') {
    return (
      <>
        <div className="door-frame"><MessageCircle size={18} /></div>
        <div className="whatsapp-badge">WA</div>
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  if (zone.id === 'agent') {
    return (
      <>
        <div className="service-counter" />
        <div className="counter-screen" />
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  if (zone.id === 'catalog' || zone.id === 'drive') {
    return (
      <>
        <div className="shelf-stack">
          {Array.from({ length: 18 }).map((_, index) => <b key={index} />)}
        </div>
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  if (zone.id === 'freezer') {
    return (
      <>
        <div className="freezer-door" />
        <div className="freezer-light" />
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  if (zone.id === 'approval') {
    return (
      <>
        <div className="approval-podium" />
        <div className="alert-ring" />
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  if (zone.id === 'payment') {
    return (
      <>
        <div className="cash-desk" />
        <div className="cash-screen" />
        <ZoneLabel zone={zone} Icon={Icon} />
      </>
    );
  }
  return <ZoneLabel zone={zone} Icon={Icon} />;
}

function ZoneLabel({ zone, Icon }) {
  return (
    <div className="zone-label">
      <Icon size={16} />
      <strong>{zone.short}</strong>
      <span>{zone.label}</span>
    </div>
  );
}

function SummaryView({ conversations: conversationItems, events, metrics, onNavigate, onSelectConversation, requests: requestItems, tools: toolItems, usage }) {
  const activePipeline = [
    ['Entrada', conversationItems.filter((item) => item.path.includes('whatsapp')).length],
    ['Atención IA', conversationItems.filter((item) => item.path.includes('agent')).length],
    ['Catálogo', conversationItems.filter((item) => item.stage === 'catalog').length],
    ['Aprobación', requestItems.length],
    ['Cierre', conversationItems.filter((item) => item.stage === 'payment').length],
  ];
  const health = toolItems.reduce(
    (acc, tool) => {
      acc[tool.status] = (acc[tool.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <section className="summary-layout">
      <div className="section-title">
        <span className="eyebrow">Resumen operativo</span>
        <h2>Qué requiere atención ahora</h2>
      </div>
      <div className="summary-grid">
        <UsagePlanCard usage={usage} onOpenAnalytics={() => onNavigate('analytics')} />
        <article className="ops-card priority-card">
          <div className="mini-row">
            <span>Prioridad</span>
            <StatusPill status={requestItems.length ? 'approval_required' : 'resolved'} />
          </div>
          <h3>{requestItems.length ? `${requestItems.length} aprobaciones pendientes` : 'Operación sin bloqueos humanos'}</h3>
          <p>Las aprobaciones muestran contexto, consecuencia y acciones trazables antes de liberar el flujo.</p>
          <button className="approve-btn" type="button" onClick={() => onNavigate('approvals')}>
            <ListChecks size={16} />
            Revisar aprobaciones
          </button>
        </article>
        <article className="ops-card">
          <span className="eyebrow">Embudo vivo</span>
          <div className="funnel-bars">
            {activePipeline.map(([label, value], index) => (
              <button
                className="funnel-row"
                key={label}
                onClick={() => onNavigate(index === 3 ? 'approvals' : 'conversations')}
                type="button"
              >
                <span>{label}</span>
                <b style={{ width: `${Math.max(value * 18, 12)}%` }} />
                <strong>{value}</strong>
              </button>
            ))}
          </div>
        </article>
        <article className="ops-card">
          <span className="eyebrow">Salud operativa</span>
          <div className="health-grid">
            <div>
              <strong>{health.sandbox_ready ?? 0}</strong>
              <span>Listas</span>
            </div>
            <div>
              <strong>{metrics.binding}</strong>
              <span>Conexiones</span>
            </div>
            <div>
              <strong>{metrics.failed}</strong>
              <span>Riesgos</span>
            </div>
          </div>
          <button className="ghost-btn compact" type="button" onClick={() => onNavigate('config')}>
            <Settings2 size={16} />
            Ver integraciones
          </button>
        </article>
        <article className="ops-card span-2">
          <span className="eyebrow">Conversaciones recientes</span>
          <div className="conversation-list compact-list">
            {conversationItems.slice(0, 4).map((conversation) => (
              <button className="conversation-row" key={conversation.id} onClick={() => onSelectConversation(conversation.id, 'store')} type="button">
                <span className="avatar-token">{conversation.avatar}</span>
                <div>
                  <strong>{conversation.customer}</strong>
                  <span>{conversation.need}</span>
                </div>
                <StatusPill status={conversation.status} />
              </button>
            ))}
          </div>
        </article>
        <article className="ops-card">
          <span className="eyebrow">Eventos</span>
          {events.slice(0, 5).map((event) => (
            <p className="event-line" key={event.id}>
              <span>{formatEventTime(event.at)}</span> {eventTypeLabel(event.type)}
            </p>
          ))}
        </article>
      </div>
    </section>
  );
}

function UsagePlanCard({ usage, onOpenAnalytics }) {
  const interactionsPct = usage.percentages?.interactions ?? 0;
  const deliveriesPct = usage.percentages?.deliveries ?? 0;
  const periodLabel = usage.period?.replace('-', ' / ') ?? 'mes actual';
  const planName = planLabel(usage.planCode?.replaceAll('_', ' ')) ?? 'plan activo';
  return (
    <article className={`ops-card usage-card usage-${usageTone(Math.max(interactionsPct, deliveriesPct))}`}>
      <div className="mini-row">
        <span>Uso del plan</span>
        <strong>{periodLabel}</strong>
      </div>
      <h3>{planName}</h3>
      <UsageMeter
        label="Domicilios"
        used={usage.metrics.deliveries_confirmed}
        limit={usage.limits.includedDeliveries}
        percent={deliveriesPct}
      />
      <UsageMeter
        label="Interacciones"
        used={usage.metrics.agent_interactions}
        limit={usage.limits.includedInteractions}
        percent={interactionsPct}
      />
      <div className="usage-mini-grid">
        <div>
          <span>Motor IA</span>
          <strong>{formatCompactNumber(usage.metrics.llm_total_tokens)} tokens</strong>
        </div>
        <div>
          <span>Herramientas</span>
          <strong>{formatCompactNumber(usage.metrics.tool_calls)}</strong>
        </div>
      </div>
      {onOpenAnalytics && (
        <button className="ghost-btn compact" type="button" onClick={onOpenAnalytics}>
          <BarChart3 size={16} />
          Ver detalle
        </button>
      )}
    </article>
  );
}

function UsageMeter({ label, used, limit, percent }) {
  return (
    <div className={`usage-meter usage-${usageTone(percent)}`}>
      <div className="mini-row">
        <span>{label}</span>
        <strong>{formatUsageRatio(used, limit)}</strong>
      </div>
      <div className="usage-track" aria-label={`${label}: ${Math.min(percent, 100)}% usado`}>
        <span style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <small>{limit ? `${Math.max(limit - used, 0).toLocaleString('es-CO')} disponibles` : 'Sin límite configurado'}</small>
    </div>
  );
}

function ConversationsView({
  conversations: conversationItems,
  events,
  onSelectConversation,
  query,
  selectedId,
  setQuery,
  setStatusFilter,
  statusFilter,
}) {
  const statuses = ['all', 'live', 'approval_required', 'blocked', 'degraded', 'needs_binding'];
  return (
    <section className="conversations-layout">
      <div className="section-title split-title">
        <div>
          <span className="eyebrow">Vista lista</span>
          <h2>Bandeja de conversaciones</h2>
        </div>
        <div className="filter-strip">
          <label className="global-search inline-search">
            <Search size={16} />
            <input
              aria-label="Buscar en conversaciones"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, ID, necesidad"
              value={query}
            />
          </label>
          <label className="select-filter">
            <ListFilter size={16} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'Todos los estados' : statusLabel[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="conversation-grid">
        <article className="conversation-list">
          {conversationItems.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <h3>Sin conversaciones para este filtro</h3>
              <p>Ajusta la búsqueda o vuelve a todos los estados.</p>
            </div>
          )}
          {conversationItems.map((conversation) => (
            <button
              className={selectedId === conversation.id ? 'conversation-row is-selected' : 'conversation-row'}
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              type="button"
            >
              <span className="avatar-token">{conversation.avatar}</span>
              <div>
                <strong>{conversation.customer}</strong>
                <span>{conversation.id} · {toolLabel(conversation.lastTool)}</span>
                <small>{conversation.nextStep}</small>
              </div>
              <b>{conversation.progress}%</b>
              <StatusPill status={conversation.status} />
            </button>
          ))}
        </article>
        <Traceability events={events} conversations={conversationItems} compact />
      </div>
    </section>
  );
}

function ConversationPanel({ conversation, events, onClose, onOpenApprovals, onOpenList, pendingRequest }) {
  if (!conversation) return null;
  const relevantEvents = events.filter((event) => event.conversationId === conversation.id).slice(0, 3);
  const eventPreview = relevantEvents.length ? relevantEvents : events.slice(0, 3);
  const needsHuman = conversation.status === 'approval_required' || conversation.status === 'blocked' || Boolean(pendingRequest);
  const nextAction = needsHuman
    ? pendingRequest?.title ?? conversation.humanReason ?? 'Revisar intervención humana'
    : conversation.nextStep;
  const riskLabel = needsHuman ? 'Requiere acción humana' : conversation.status === 'degraded' ? 'Operación degradada' : 'Flujo normal';
  return (
    <aside className="detail-panel operator-panel">
      <div className="panel-heading">
        <span className="eyebrow">Caso seleccionado</span>
        <div className="panel-title-row">
          <h2>{conversation.customer}</h2>
          <StatusPill status={conversation.status} />
          {onClose && (
            <button className="icon-btn compact" type="button" title="Cerrar caso" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="action-card">
        <span>Próxima acción recomendada</span>
        <strong>{nextAction}</strong>
        <div className="button-row">
          {needsHuman && (
            <button className="approve-btn compact" type="button" onClick={onOpenApprovals}>
              <UserCheck size={16} />
              Abrir aprobación
            </button>
          )}
          <button className="ghost-btn compact" type="button" onClick={onOpenList}>
            <MessageSquareText size={16} />
            Ver lista
          </button>
        </div>
      </div>

      <div className="operator-stats">
        <div>
          <span>Valor</span>
          <strong>{conversation.value}</strong>
        </div>
        <div>
          <span>Etapa</span>
          <strong>{stageLabel(conversation.stage)}</strong>
        </div>
        <div>
          <span>Progreso</span>
          <strong>{conversation.progress}%</strong>
        </div>
      </div>

      <div className="progress-block">
        <div className="progress-track">
          <span style={{ width: `${conversation.progress}%` }} />
        </div>
      </div>

      <div className="info-stack compact-info">
        <InfoLine icon={Search} label="Objetivo del cliente" value={conversation.need} />
        <InfoLine icon={PlugZap} label="Evidencia / herramienta" value={toolLabel(conversation.lastTool)} />
        <InfoLine icon={AlertTriangle} label="Riesgo operativo" value={riskLabel} />
      </div>

      {pendingRequest && (
        <div className="approval-context">
          <strong>{pendingRequest.urgency} · {pendingRequest.type}</strong>
          <span>{pendingRequest.context}</span>
        </div>
      )}

      <div className="event-card operator-events">
        <div className="mini-row">
          <strong>Última actividad</strong>
          <Eye size={16} />
        </div>
        {eventPreview.map((event) => (
          <p key={event.id}>
            <span>{formatEventTime(event.at)}</span> {eventTypeLabel(event.type)}
          </p>
        ))}
      </div>
    </aside>
  );
}

function InfoLine({ icon: Icon, label, value }) {
  return (
    <div className="info-line">
      <Icon size={17} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function HumanQueue({ requests, conversations, onSelectConversation, onResolve, draftReply, setDraftReply }) {
  return (
    <section className="queue-layout">
      <div className="section-title">
        <span className="eyebrow">Aprobaciones</span>
        <h2>Bandeja priorizada de intervención humana</h2>
      </div>
      <div className="queue-grid">
        {requests.length === 0 && (
          <article className="empty-state">
            <BadgeCheck size={28} />
            <h3>Sin pendientes humanos</h3>
            <p>Las solicitudes resueltas emiten eventos de aprobación o rechazo y liberan el flujo del agente.</p>
          </article>
        )}
        {requests.map((request) => {
          const conversation = conversations.find((item) => item.id === request.conversationId);
          return (
            <article className="request-card" key={request.id}>
              <div className="request-top">
                <span className={`urgency urgency-${request.urgency.toLowerCase()}`}>{request.urgency}</span>
                <code>{eventTypeLabel(request.type)}</code>
              </div>
              <h3>{request.title}</h3>
              <p>{request.context}</p>
              <div className="impact-box">
                <strong>Después de responder</strong>
                <span>{request.consequence}</span>
              </div>
              <div className="mini-row">
                <button className="text-btn" type="button" onClick={() => onSelectConversation(request.conversationId)}>
                  Ver {conversation?.customer ?? request.conversationId}
                </button>
                <span>{request.conversationId}</span>
              </div>
              <textarea value={draftReply} onChange={(event) => setDraftReply(event.target.value)} rows={3} />
              <div className="button-row">
                <button className="approve-btn" type="button" onClick={() => onResolve(request.id, 'approved')}>
                  <Check size={16} />
                  Aprobar
                </button>
                <button className="deny-btn" type="button" onClick={() => onResolve(request.id, 'denied')}>
                  <X size={16} />
                  Rechazar
                </button>
                <button className="ghost-btn compact" type="button" onClick={() => onResolve(request.id, 'approved')}>
                  <Send size={16} />
                  Responder
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OnboardingView({ billingStatus, bundle, busyAction, error, onAction, onNavigate, onWhatsAppAction, tenant }) {
  const status = bundle?.status ?? fallbackOnboardingStatus(tenant);
  const checks = status.checks ?? [];
  const enrichedSteps = checks.map((check) => ({ ...check, meta: onboardingStepMeta(check.key) }));
  const next = nextOnboardingAction(status);
  const completeCount = checks.filter((item) => item.ok).length;
  const progress = Math.round((completeCount / Math.max(checks.length, 1)) * 100);
  const workspace = bundle?.googleWorkspace;
  const googleConnection = bundle?.googleConnection;
  const whatsappOnboarding = bundle?.whatsappOnboarding ?? fallbackWhatsAppOnboarding(tenant);
  const subscription = status.subscription ?? bundle?.subscription;
  const currentStep = enrichedSteps.find((item) => !item.ok) ?? enrichedSteps.at(-1);
  const currentMeta = currentStep?.meta ?? onboardingStepMeta(status.nextStep);
  const CurrentIcon = currentMeta.icon;
  const operationLabel = status.readyForOperation
    ? 'Operación habilitada'
    : status.readyForActivation
      ? 'Lista para activar'
      : 'Configuración en curso';
  const remainingCount = Math.max(checks.length - completeCount, 0);
  const onboardingSignals = [
    {
      icon: CircleDollarSign,
      label: 'Suscripción',
      value: humanState(subscription?.status) ?? 'Por validar',
      state: subscription?.status === 'active' || subscription?.status === 'authorized' ? 'ok' : 'warn',
    },
    {
      icon: UserCheck,
      label: 'Google del cliente',
      value: googleConnection?.accountEmail ?? 'Pendiente',
      state: googleConnection?.accountEmail ? 'ok' : 'warn',
    },
    {
      icon: MessageCircle,
      label: 'WhatsApp',
      value: tenant.config?.whatsapp?.phoneNumberId ? 'Número conectado' : 'Por conectar',
      state: tenant.config?.whatsapp?.phoneNumberId ? 'ok' : 'warn',
    },
    {
      icon: Bot,
      label: 'Motor IA',
      value: 'DeepSeek plataforma',
      state: 'ok',
    },
  ];

  return (
    <section className="onboarding-layout">
      <div className="onboarding-hero">
        <div className="onboarding-hero-copy">
          <span className="eyebrow">Puesta en marcha guiada</span>
          <h2>{tenant.name}</h2>
          <p>
            Acompañamos la activación de la tienda paso a paso: pago de plataforma, Google del cliente,
            estructura operativa, DeepSeek y WhatsApp aislado por tienda.
          </p>
          <div className="hero-next">
            <CurrentIcon size={18} />
            <span>{operationLabel}</span>
            <strong>{currentMeta.short}</strong>
          </div>
        </div>
        <div className="onboarding-score" style={{ '--setup-progress': `${progress}%` }}>
          <span>Avance</span>
          <strong>{progress}%</strong>
          <b>{completeCount}/{checks.length}</b>
          <i />
        </div>
        <div className="onboarding-hero-actions">
          <button className="ghost-btn" type="button" onClick={() => onAction('validate')} disabled={busyAction === 'validate'}>
            <RotateCcw size={16} />
            Validar
          </button>
          <button className="approve-btn" type="button" onClick={() => onAction(next.action)} disabled={!next.action || Boolean(busyAction)}>
            <Check size={16} />
            {busyAction ? 'Procesando' : next.label}
          </button>
        </div>
      </div>

      <div className="activation-strip" aria-label="Resumen de activación">
        {onboardingSignals.map(({ icon: Icon, label, state, value }) => (
          <article className={`activation-card is-${state}`} key={label}>
            <Icon size={18} />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <BillingOwnerPanel
        billing={billingStatus}
        busyAction={busyAction}
        onAction={onAction}
        subscription={subscription}
      />

      <div className="guided-grid">
        <article className="guide-panel next-step-panel">
          <span className="eyebrow">Siguiente paso recomendado</span>
          <div className="next-step-heading">
            <CurrentIcon size={22} />
            <div>
              <h3>{next.title}</h3>
              <p>{next.detail}</p>
            </div>
          </div>
          <div className="guide-explainer">
            <div>
              <span>Por qué importa</span>
              <strong>{currentMeta.why}</strong>
            </div>
            <div>
              <span>Qué necesitas</span>
              <strong>{currentMeta.needs}</strong>
            </div>
          </div>
          <div className="button-row">
            {next.secondary && (
              <button className="ghost-btn" type="button" onClick={() => onNavigate(next.secondary.view)}>
                <Settings2 size={16} />
                {next.secondary.label}
              </button>
            )}
            {status.readyForActivation && !status.readyForOperation && (
              <button className="approve-btn" type="button" onClick={() => onAction('activate')} disabled={Boolean(busyAction)}>
                <ShieldCheck size={16} />
                Activar tienda
              </button>
            )}
          </div>
          {error && (
            <div className="setup-error">
              <AlertTriangle size={17} />
              <span>{error}</span>
            </div>
          )}
        </article>

        <article className="guide-panel readiness-panel">
          <span className="eyebrow">Estado de la tienda</span>
          <div className="readiness-summary">
            <strong>{remainingCount ? `${remainingCount} pasos pendientes` : 'Lista para validar operación'}</strong>
            <span>{status.readyForOperation ? 'La tienda ya puede operar con controles activos.' : 'Cada paso queda validado antes de habilitar la operación.'}</span>
          </div>
          <div className="readiness-list">
            <ResourceRow icon={ShieldCheck} label="Operación" value={operationLabel} />
            <ResourceRow icon={CircleDollarSign} label="Pago plataforma" value={humanState(subscription?.status) ?? 'Sin validar'} />
            <ResourceRow icon={UserCheck} label="Cuenta Google" value={googleConnection?.accountEmail ?? 'No conectada'} />
            <ResourceRow icon={MessageCircle} label="WhatsApp" value={tenant.config?.whatsapp?.phoneNumberId ? 'Número conectado' : 'Pendiente'} />
          </div>
        </article>
      </div>

      <article className="journey-panel">
        <div className="journey-title">
          <div>
            <span className="eyebrow">Ruta de activación</span>
            <h3>De suscripción a operación real</h3>
          </div>
          <span>{completeCount} etapas completas</span>
        </div>
        <div className="setup-board">
          {enrichedSteps.map((check, index) => (
            <OnboardingStep
              busyAction={busyAction}
              check={check}
              index={index}
              isCurrent={!check.ok && check.key === status.nextStep}
              key={check.key}
              onAction={onAction}
            />
          ))}
        </div>
      </article>

      <article className="guide-panel test-drive-panel">
        <div>
          <span className="eyebrow">Prueba guiada</span>
          <h3>Antes de publicar, valida una conversación completa</h3>
          <p>Usa casos de tienda reales: cliente nuevo, producto ambiguo, varias presentaciones, producto agotado y escalamiento humano.</p>
        </div>
        <div className="test-script-grid">
          <div>
            <MessageCircle size={17} />
            <span>Cliente escribe por WhatsApp</span>
            <strong>"Buenas, para un domicilio..."</strong>
          </div>
          <div>
            <Search size={17} />
            <span>Motor IA interpreta</span>
            <strong>Consulta catálogo y decide si pregunta o escala</strong>
          </div>
          <div>
            <ShoppingBag size={17} />
            <span>Pedido queda listo</span>
            <strong>Registra canasta en Google Sheets</strong>
          </div>
        </div>
        <div className="button-row">
          <button className="approve-btn" type="button" onClick={() => onNavigate('store')}>
            <Store size={16} />
            Abrir Tienda viva
          </button>
          <button className="ghost-btn" type="button" onClick={() => onNavigate('conversations')}>
            <MessageSquareText size={16} />
            Ver conversaciones
          </button>
        </div>
      </article>

      <WhatsAppActivationWizard
        busyAction={busyAction}
        onboarding={whatsappOnboarding}
        onAction={onWhatsAppAction}
        onOpenConfig={() => onNavigate('config')}
        tenant={tenant}
      />

      <div className="onboarding-grid">
        <article className="guide-panel">
          <span className="eyebrow">Recursos Google</span>
          <h3>Información operativa del cliente</h3>
          <div className="resource-list">
            <ResourceRow icon={UserCheck} label="Cuenta" value={googleConnection?.accountEmail ?? 'Pendiente'} />
            <ResourceRow icon={Database} label="Google Sheets" value={workspace?.spreadsheet?.id ?? 'Pendiente'} />
            <ResourceRow icon={ShoppingBag} label="Catálogo" value={workspace?.sheets?.catalog ?? 'Catalogo'} />
            <ResourceRow icon={MessageCircle} label="Clientes" value={tenant.config?.googleSheets?.customerProfilesRange ?? 'Clientes!A1:F500'} />
          </div>
          {workspace?.spreadsheet?.url && (
            <a className="text-link" href={workspace.spreadsheet.url} target="_blank" rel="noreferrer">
              Abrir Google Sheets
            </a>
          )}
        </article>

        <article className="guide-panel">
          <span className="eyebrow">Aislamiento por cliente</span>
          <h3>Credenciales y motor separados</h3>
          <div className="resource-list">
            <ResourceRow icon={MessageCircle} label="Identificador WhatsApp" value={tenant.config?.whatsapp?.phoneNumberId ?? 'Pendiente'} />
            <ResourceRow icon={KeyRound} label="Referencia segura WhatsApp" value={tenant.config?.whatsapp?.accessTokenRef ?? 'Referencia pendiente'} />
            <ResourceRow icon={Bot} label="Motor IA" value="DeepSeek administrado por la plataforma" />
            <ResourceRow icon={ShieldCheck} label="Acceso" value={humanState(tenant.lifecycle?.access) ?? 'Pendiente'} />
          </div>
        </article>
      </div>
    </section>
  );
}

function BillingOwnerPanel({ billing, busyAction, onAction, subscription }) {
  const plan = billing?.plan;
  const activeSubscription = billing?.subscription ?? subscription;
  const usage = billing?.usageCycle;
  const payments = billing?.payments ?? [];
  const deliveriesUsed = Number(usage?.deliveriesUsed ?? 0);
  const interactionsUsed = Number(usage?.interactionsUsed ?? 0);
  const includedDeliveries = Number(plan?.includedDeliveries ?? activeSubscription?.includedDeliveries ?? 1000);
  const includedInteractions = Number(plan?.includedInteractions ?? activeSubscription?.includedInteractions ?? 5000);
  const canContinue = billing?.actions?.canContinueCheckout;
  const canStart = billing?.actions?.canStartCheckout;
  const status = activeSubscription?.status ?? 'pending_payment';
  const nextDate = activeSubscription?.nextBillingDate ?? activeSubscription?.currentPeriodEnd;
  return (
    <article className="billing-owner-panel">
      <div className="billing-owner-copy">
        <span className="eyebrow">Facturación de plataforma</span>
        <h3>{plan?.name ?? 'Plan Ventas IA'}</h3>
        <p>Precio final único. Mercado Pago cobra la suscripción mensual; los pagos de domicilios siguen siendo de la tienda.</p>
      </div>
      <div className="billing-owner-status">
        <span className={`billing-state is-${status}`}>{humanState(status)}</span>
        <strong>{formatCurrency(plan?.amount ?? activeSubscription?.amount ?? 89000, plan?.currency ?? 'COP')}</strong>
        <small>{nextDate ? `Próximo cobro ${formatDateShort(nextDate)}` : 'Cobro por aniversario de suscripción'}</small>
      </div>
      <div className="billing-owner-usage">
        <UsageMiniBar label="Domicilios" value={deliveriesUsed} limit={includedDeliveries} />
        <UsageMiniBar label="Interacciones" value={interactionsUsed} limit={includedInteractions} />
      </div>
      <div className="billing-owner-actions">
        {canContinue ? (
          <button className="approve-btn compact" type="button" onClick={() => onAction('billing-continue')} disabled={Boolean(busyAction)}>
            <CircleDollarSign size={16} />
            Continuar pago
          </button>
        ) : canStart ? (
          <button className="approve-btn compact" type="button" onClick={() => onAction('billing-checkout')} disabled={Boolean(busyAction)}>
            <CircleDollarSign size={16} />
            Activar suscripción
          </button>
        ) : (
          <button className="ghost-btn compact" type="button" onClick={() => onAction('billing-cancel')} disabled={Boolean(busyAction)}>
            <X size={16} />
            Cancelar al final del periodo
          </button>
        )}
        <div className="billing-payment-preview">
          <span>Último pago</span>
          <strong>{payments[0] ? `${humanState(payments[0].status)} · ${formatDateShort(payments[0].paidAt)}` : 'Sin pagos confirmados'}</strong>
        </div>
      </div>
    </article>
  );
}

function UsageMiniBar({ label, value, limit }) {
  const percentage = Math.min(100, Math.round((Number(value) / Math.max(Number(limit), 1)) * 100));
  return (
    <div className="usage-mini-bar">
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString('es-CO')} / {limit.toLocaleString('es-CO')}</strong>
      </div>
      <i><b style={{ width: `${percentage}%` }} /></i>
    </div>
  );
}

function OnboardingStep({ busyAction, check, index, isCurrent, onAction }) {
  const meta = check.meta ?? onboardingStepMeta(check.key);
  const Icon = meta.icon;
  const action = onboardingStepAction(check.key);
  return (
    <article className={`setup-step ${check.ok ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}>
      <span className="setup-index">{check.ok ? <Check size={15} /> : index + 1}</span>
      <div className="setup-copy">
        <div>
          <Icon size={17} />
          <strong>{meta.title}</strong>
        </div>
        <p>{meta.description}</p>
        <span>{onboardingDetailLabel(check)}</span>
      </div>
      {check.ok ? (
        <span className="setup-chip is-ok">Listo</span>
      ) : (
        <button className="ghost-btn compact" type="button" onClick={() => onAction(action.key)} disabled={busyAction === action.key}>
          {action.icon}
          {busyAction === action.key ? 'Procesando' : action.label}
        </button>
      )}
    </article>
  );
}

function ResourceRow({ icon: Icon, label, value }) {
  return (
    <div className="resource-row">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function onboardingDetailLabel(check) {
  if (!check) return 'Pendiente';
  if (check.ok) {
    const labels = {
      subscription: 'Pago validado',
      google_oauth: 'Cuenta autorizada',
      google_provisioning: 'Estructura creada',
      llm: 'Motor IA disponible',
      whatsapp: 'Canal conectado',
    };
    return labels[check.key] ?? 'Listo';
  }
  if (check.detail === 'missing') return 'Pendiente por completar';
  if (String(check.detail ?? '').includes('backend')) return 'Pendiente de validación local';
  return check.detail ?? 'Pendiente';
}

function whatsappPathLabel(value) {
  const labels = {
    cloud_api_existing: 'Ya tiene Cloud API',
    business_app_existing: 'Tiene WhatsApp Business App',
    new_business: 'Empieza desde cero',
  };
  return labels[value] ?? 'Sin seleccionar';
}

function whatsappStepLabel(step) {
  const byKey = {
    diagnosis: 'Diagnóstico',
    meta_auth: 'Autorización Meta',
    business: 'Cuenta WhatsApp',
    phone: 'Número y código',
    webhook: 'Eventos de conexión',
    test: 'Mensaje de prueba',
  };
  return byKey[step?.key] ?? String(step?.label ?? '').replace('Webhook', 'Eventos de conexión');
}

function whatsappStepDetail(step) {
  const details = {
    diagnosis: 'Preguntar si ya tiene WhatsApp Business, Cloud API o empieza desde cero.',
    meta_auth: 'Guiar al cliente en Meta Business hasta habilitar la cuenta.',
    business: 'Seleccionar o crear la cuenta WhatsApp del cliente, negocio, nombre visible y categoría.',
    phone: 'Validar el número del cliente, recibir el código y obtener el identificador del número.',
    webhook: 'Conectar los mensajes entrantes de WhatsApp con la URL pública de la plataforma.',
    test: 'Enviar un mensaje real cuando la URL pública esté publicada.',
  };
  return details[step?.key] ?? String(step?.detail ?? '')
    .replaceAll('phone_number_id', 'identificador del número')
    .replaceAll('WABA', 'cuenta WhatsApp')
    .replaceAll('webhook', 'evento de conexión')
    .replaceAll('Webhook', 'Evento de conexión');
}

function WhatsAppActivationWizard({ busyAction, onboarding, onAction, onOpenConfig, tenant }) {
  const [manualDraft, setManualDraft] = useState(() => ({
    phoneNumberId: tenant.config?.whatsapp?.phoneNumberId ?? '',
    wabaId: tenant.config?.whatsapp?.wabaId ?? '',
    displayPhoneNumber: tenant.config?.whatsapp?.displayPhoneNumber ?? tenant.whatsappNumber ?? '',
  }));
  useEffect(() => {
    setManualDraft({
      phoneNumberId: tenant.config?.whatsapp?.phoneNumberId ?? '',
      wabaId: tenant.config?.whatsapp?.wabaId ?? '',
      displayPhoneNumber: tenant.config?.whatsapp?.displayPhoneNumber ?? tenant.whatsappNumber ?? '',
    });
  }, [tenant]);

  const paths = [
    {
      key: 'cloud_api_existing',
      title: 'Ya tiene Cloud API',
      detail: 'Conectamos la cuenta, el número y la referencia segura del negocio existente.',
      hasWhatsAppBusiness: true,
    },
    {
      key: 'business_app_existing',
      title: 'Tiene WhatsApp Business App',
      detail: 'Guiamos migración o activación del número para responder desde la plataforma.',
      hasWhatsAppBusiness: true,
    },
    {
      key: 'new_business',
      title: 'Empieza desde cero',
      detail: 'Acompañamos creación del negocio en Meta, cuenta WhatsApp y número.',
      hasWhatsAppBusiness: false,
    },
  ];
  const currentPath = onboarding.setupPath;
  const connected = onboarding.status === 'connected';
  return (
    <article className="guide-panel whatsapp-wizard">
      <div className="wizard-heading">
        <div>
          <span className="eyebrow">Activación WhatsApp Business</span>
          <h3>Conexión guiada del canal del cliente</h3>
          <p>Primero identificamos el punto de partida. Si el alta guiada de Meta está configurada, la microapp abre la conexión; si no, deja una guía operativa paso a paso.</p>
        </div>
        <span className={`automation-chip ${onboarding.canAutomate ? 'is-ready' : 'is-manual'}`}>
          {onboarding.canAutomate ? 'Alta guiada disponible' : 'Guía asistida'}
        </span>
      </div>

      <div className="whatsapp-path-grid">
        {paths.map((path) => (
          <button
            className={`whatsapp-path ${currentPath === path.key ? 'is-selected' : ''}`}
            disabled={busyAction === 'whatsapp-intent' || connected}
            key={path.key}
            onClick={() => onAction('intent', {
              setupPath: path.key,
              hasWhatsAppBusiness: path.hasWhatsAppBusiness,
              businessName: tenant.name,
              contactPhone: tenant.whatsappNumber,
            })}
            type="button"
          >
            <span>{path.title}</span>
            <strong>{path.detail}</strong>
          </button>
        ))}
      </div>

      <div className="wizard-content-grid">
        <div className="whatsapp-step-list">
          {onboarding.steps.map((step) => (
            <div className={`whatsapp-step is-${step.status}`} key={step.key}>
              <span>{step.status === 'done' ? <Check size={14} /> : step.status === 'locked' ? <Lock size={14} /> : <MessageCircle size={14} />}</span>
              <div>
                <strong>{whatsappStepLabel(step)}</strong>
                <p>{whatsappStepDetail(step)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="whatsapp-sidecar">
          <div className="manual-guide">
            <strong>{connected ? 'Canal conectado' : onboarding.canAutomate ? 'Listo para alta guiada Meta' : 'Pendiente configuración Meta'}</strong>
            <p>
              {connected
                ? `El identificador ${onboarding.binding.phoneNumberId} ya está asociado a esta tienda.`
                : onboarding.canAutomate
                  ? 'El siguiente paso abre Meta para seleccionar negocio, cuenta WhatsApp y número.'
                  : 'Para automatizar desde la interfaz falta configurar el alta guiada de Meta; mientras tanto la pantalla guía el alta manual.'}
            </p>
          </div>
          <div className="resource-list compact-resource-list">
            <ResourceRow icon={Store} label="Ruta" value={whatsappPathLabel(currentPath)} />
            <ResourceRow icon={MessageCircle} label="Número" value={onboarding.binding.displayPhoneNumber ?? 'Pendiente'} />
            <ResourceRow icon={KeyRound} label="Referencia segura" value={onboarding.binding.accessTokenRef ?? tenant.config?.whatsapp?.accessTokenRef ?? 'Pendiente'} />
          </div>
          <div className="button-row">
            <button
              className="approve-btn"
              disabled={!currentPath || Boolean(busyAction) || connected}
              onClick={() => onAction('start', {})}
              type="button"
            >
              <Send size={16} />
              {onboarding.canAutomate ? 'Iniciar alta guiada' : 'Preparar guía'}
            </button>
            <button className="ghost-btn" type="button" onClick={onOpenConfig}>
              <Settings2 size={16} />
              Configuración avanzada
            </button>
          </div>
        </div>
      </div>

      {!connected && (
        <div className="manual-binding">
          <label className="config-field">
            <span>
              <MessageCircle size={16} />
              Identificador del número
            </span>
            <input value={manualDraft.phoneNumberId} onChange={(event) => setManualDraft((current) => ({ ...current, phoneNumberId: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <Building2 size={16} />
              Cuenta WhatsApp Business
            </span>
            <input value={manualDraft.wabaId} onChange={(event) => setManualDraft((current) => ({ ...current, wabaId: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <MessageSquareText size={16} />
              Teléfono visible
            </span>
            <input value={manualDraft.displayPhoneNumber} onChange={(event) => setManualDraft((current) => ({ ...current, displayPhoneNumber: event.target.value }))} />
          </label>
          <button
            className="approve-btn"
            disabled={!manualDraft.phoneNumberId.trim() || busyAction === 'whatsapp-binding'}
            onClick={() => onAction('binding', {
              phoneNumberId: manualDraft.phoneNumberId.trim(),
              wabaId: manualDraft.wabaId.trim(),
              displayPhoneNumber: manualDraft.displayPhoneNumber.trim(),
            })}
            type="button"
          >
            <Check size={16} />
            Guardar conexión
          </button>
        </div>
      )}
    </article>
  );
}

function fallbackOnboardingStatus(tenant) {
  const checks = [
    { key: 'subscription', label: 'Suscripcion activa en Mercado Pago', ok: false, detail: 'Sin datos del backend SaaS' },
    { key: 'google_oauth', label: 'OAuth Google conectado', ok: false, detail: 'Sin datos del backend SaaS' },
    { key: 'google_provisioning', label: 'Drive y Sheets aprovisionados', ok: false, detail: 'Sin datos del backend SaaS' },
    {
      key: 'llm',
      label: 'DeepSeek global de plataforma',
      ok: true,
      detail: 'deepseek-chat',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp separado por tienda',
      ok: Boolean(tenant.config?.whatsapp?.phoneNumberId),
      detail: tenant.config?.whatsapp?.phoneNumberId ?? 'missing',
    },
  ];
  return {
    checks,
    nextStep: checks.find((item) => !item.ok)?.key ?? 'activation',
    readyForActivation: checks.every((item) => item.ok),
    readyForOperation: false,
    subscription: null,
  };
}

function fallbackWhatsAppOnboarding(tenant) {
  const phoneNumberId = tenant.config?.whatsapp?.phoneNumberId ?? null;
  return {
    tenantId: tenant.id,
    setupPath: phoneNumberId ? 'cloud_api_existing' : null,
    status: phoneNumberId ? 'connected' : 'needs_path',
    automationMode: 'guided_manual',
    canAutomate: false,
    nextAction: phoneNumberId ? 'validate' : 'choose_setup_path',
    binding: {
      phoneNumberId,
      wabaId: tenant.config?.whatsapp?.wabaId ?? null,
      displayPhoneNumber: tenant.config?.whatsapp?.displayPhoneNumber ?? tenant.whatsappNumber ?? null,
      accessTokenRef: tenant.config?.whatsapp?.accessTokenRef ?? null,
    },
    steps: [
      { key: 'diagnosis', label: 'Diagnóstico', status: phoneNumberId ? 'done' : 'current', detail: 'Definir si el cliente ya tiene WhatsApp Business, Cloud API o empieza desde cero.' },
      { key: 'meta_auth', label: 'Autorización Meta', status: phoneNumberId ? 'done' : 'locked', detail: 'Conectar o guiar al dueño en Meta Business.' },
      { key: 'business', label: 'Cuenta WhatsApp', status: phoneNumberId ? 'done' : 'locked', detail: 'Seleccionar o crear la cuenta WhatsApp del cliente.' },
      { key: 'phone', label: 'Número y código', status: phoneNumberId ? 'done' : 'locked', detail: 'Obtener el identificador del número activo.' },
      { key: 'webhook', label: 'Eventos de conexión', status: phoneNumberId ? 'done' : 'locked', detail: 'Preparar la recepción de mensajes contra la URL pública.' },
      { key: 'test', label: 'Mensaje de prueba', status: phoneNumberId ? 'current' : 'locked', detail: 'Probar recepción y respuesta real.' },
    ],
  };
}

function onboardingStepIcon(key) {
  return onboardingStepMeta(key).icon;
}

function onboardingStepMeta(key) {
  const metadata = {
    subscription: {
      icon: CircleDollarSign,
      title: 'Suscripción activa',
      short: 'Pago de plataforma',
      description: 'Confirma que la tienda tiene derecho de uso mensual antes de operar.',
      why: 'Evita entregar servicio a clientes vencidos o sin plan activo.',
      needs: 'Pago activo o activación sandbox para pruebas locales.',
    },
    google_oauth: {
      icon: UserCheck,
      title: 'Google conectado',
      short: 'Permisos del cliente',
      description: 'Autoriza Drive y Sheets de la tienda con OAuth seguro.',
      why: 'Los datos operativos viven en el Google del cliente, no mezclados en la plataforma.',
      needs: 'Cuenta Google del dueño y consentimiento OAuth.',
    },
    google_provisioning: {
      icon: Database,
      title: 'Drive y Sheets creados',
      short: 'Estructura operativa',
      description: 'Genera catálogo, clientes, pedidos y configuración inicial.',
      why: 'El agente necesita una fuente viva para consultar productos y registrar pedidos.',
      needs: 'OAuth conectado y permisos de Drive/Sheets vigentes.',
    },
    llm: {
      icon: Bot,
      title: 'DeepSeek configurado',
      short: 'Razonamiento comercial',
      description: 'Usa el motor global de plataforma para interpretar pedidos como tendero.',
      why: 'El parser, la inferencia de productos y la decisión de herramientas dependen del motor de IA.',
      needs: 'Configuración global de plataforma activa.',
    },
    whatsapp: {
      icon: MessageCircle,
      title: 'WhatsApp aislado',
      short: 'Canal de la tienda',
      description: 'Asocia el identificador real del número para recibir y responder solo por esta tienda.',
      why: 'Impide mezclar mensajes entre clientes y habilita eventos seguros.',
      needs: 'Identificador del número de WhatsApp Business y referencias seguras.',
    },
  };
  return metadata[key] ?? {
    icon: ShieldCheck,
    title: 'Validación final',
    short: 'Control de salida',
    description: 'Revisa que todos los prerequisitos estén completos.',
    why: 'Reduce errores antes de habilitar operación real.',
    needs: 'Checklist completo.',
  };
}

function onboardingStepAction(key) {
  const action = {
    subscription: { key: 'subscription', label: 'Activar sandbox', icon: <CircleDollarSign size={15} /> },
    google_oauth: { key: 'google-oauth', label: 'Conectar Google', icon: <UserCheck size={15} /> },
    google_provisioning: { key: 'provision', label: 'Provisionar', icon: <Database size={15} /> },
    llm: { key: 'config-llm', label: 'Configurar', icon: <Bot size={15} /> },
    whatsapp: { key: 'config-whatsapp', label: 'Configurar', icon: <MessageCircle size={15} /> },
  };
  return action[key] ?? { key: 'validate', label: 'Validar', icon: <RotateCcw size={15} /> };
}

function nextOnboardingAction(status) {
  if (status.readyForOperation) {
    return {
      action: 'validate',
      label: 'Revalidar',
      title: 'La tienda ya puede operar',
      detail: 'Suscripción, Google, DeepSeek y WhatsApp están completos para esta tienda.',
    };
  }
  if (status.readyForActivation) {
    return {
      action: 'activate',
      label: 'Activar tienda',
      title: 'Todo está listo para activar',
      detail: 'La validación de prerequisitos está completa; falta marcar la tienda como operativa.',
    };
  }
  const stepAction = onboardingStepAction(status.nextStep);
  const titles = {
    subscription: ['Validar suscripción', 'El acceso depende del pago mensual de la plataforma en Mercado Pago.'],
    google_oauth: ['Conectar Google', 'La microapp necesita autorización OAuth para crear y leer los archivos del cliente.'],
    google_provisioning: ['Crear estructura Google', 'Se deben aprovisionar Drive y Google Sheets con catálogo, clientes y pedidos.'],
    llm: ['Revisar Motor IA de la plataforma', 'El motor se administra desde Centro de control y se consume transversalmente.'],
    whatsapp: ['Separar WhatsApp por tienda', 'La conexión solo debe aceptar mensajes del identificador configurado para esta tienda.'],
  };
  const [title, detail] = titles[status.nextStep] ?? ['Completar configuración', 'Hay controles pendientes antes de activar operación.'];
  return {
    action: stepAction.key,
    label: stepAction.label,
    title,
    detail,
    secondary: ['llm', 'whatsapp'].includes(status.nextStep) ? { label: 'Abrir configuración', view: 'config' } : null,
  };
}

function AnalyticsView({ conversations: conversationItems, events, requests: requestItems, tools: toolItems, usage }) {
  const stages = ['catalog', 'approval', 'handoff', 'binding', 'payment', 'off_hours'];
  const activeCount = conversationItems.filter((conversation) => conversation.status === 'live').length;
  const blockedCount = conversationItems.filter((conversation) => ['blocked', 'degraded', 'needs_binding'].includes(conversation.status)).length;
  const completedCount = conversationItems.filter((conversation) => conversation.stage === 'payment' || conversation.progress >= 85).length;
  const avgProgress = Math.round(
    conversationItems.reduce((sum, conversation) => sum + conversation.progress, 0) / Math.max(conversationItems.length, 1),
  );
  const stageCounts = stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: conversationItems.filter((conversation) => conversation.stage === stage).length,
  }));
  const maxStageCount = Math.max(1, ...stageCounts.map((stage) => stage.count));
  const connectedTools = toolItems.filter((tool) => ['sandbox_ready', 'production_ready', 'approval_required'].includes(tool.status)).length;
  const pendingTools = Math.max(toolItems.length - connectedTools, 0);
  const deliveriesPct = Math.min(usage.percentages?.deliveries ?? 0, 100);
  const interactionsPct = Math.min(usage.percentages?.interactions ?? 0, 100);
  const healthScore = Math.max(0, Math.min(100, Math.round((avgProgress * 0.45) + ((100 - Math.min(blockedCount * 18, 60)) * 0.25) + ((100 - Math.min(pendingTools * 10, 40)) * 0.3))));
  const healthTone = healthScore >= 78 ? 'ok' : healthScore >= 55 ? 'warn' : 'bad';
  const eventTypes = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});
  const topEvents = Object.entries(eventTypes)
    .map(([type, count]) => ({ type, label: eventTypeLabel(type), count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);

  return (
    <section className="analytics-layout">
      <div className="analytics-hero">
        <div>
          <span className="eyebrow">Analítica operativa</span>
          <h2>Lectura ejecutiva de la tienda</h2>
          <p>Estado comercial, capacidad del plan y puntos donde el agente necesita ayuda humana o conexiones completas.</p>
        </div>
        <div className={`analytics-score is-${healthTone}`}>
          <span>Salud</span>
          <strong>{healthScore}</strong>
          <small>{healthTone === 'ok' ? 'Operación estable' : healthTone === 'warn' ? 'Revisar señales' : 'Atención prioritaria'}</small>
        </div>
      </div>
      <div className="analytics-signal-grid">
        <AnalyticsSignal icon={Activity} label="Conversaciones activas" value={activeCount} detail={`${conversationItems.length} visibles`} tone="mint" />
        <AnalyticsSignal icon={ListChecks} label="Apoyo humano" value={requestItems.length} detail={requestItems.length ? 'Pendiente de decisión' : 'Sin pendientes'} tone="gold" />
        <AnalyticsSignal icon={ShoppingBag} label="Pedidos avanzados" value={completedCount} detail={`${avgProgress}% avance promedio`} tone="blue" />
        <AnalyticsSignal icon={PlugZap} label="Conexiones pendientes" value={pendingTools} detail={`${connectedTools}/${toolItems.length} operativas`} tone="coral" />
      </div>
      <div className="analytics-grid">
        <article className="analytics-panel usage-focus-panel">
          <div className="panel-heading">
            <span className="eyebrow">Capacidad mensual</span>
            <strong>{planLabel(usage.planCode?.replaceAll('_', ' '))}</strong>
          </div>
          <div className="capacity-ring-grid">
            <CapacityRing label="Domicilios" value={usage.metrics.deliveries_confirmed} limit={usage.limits.includedDeliveries} percent={deliveriesPct} />
            <CapacityRing label="Interacciones" value={usage.metrics.agent_interactions} limit={usage.limits.includedInteractions} percent={interactionsPct} />
          </div>
          <div className="usage-mini-grid">
            <div>
              <span>Motor IA</span>
              <strong>{formatCompactNumber(usage.metrics.llm_total_tokens)} tokens</strong>
            </div>
            <div>
              <span>Herramientas</span>
              <strong>{formatCompactNumber(usage.metrics.tool_calls)}</strong>
            </div>
          </div>
        </article>
        <article className="analytics-panel stage-flow-panel span-2">
          <div className="panel-heading">
            <span className="eyebrow">Flujo comercial</span>
            <strong>Etapas con mayor carga</strong>
          </div>
          <div className="stage-bars">
            {stageCounts.map((stage) => (
              <div className="stage-row rich-stage-row" key={stage.stage}>
                <span>{stage.label}</span>
                <b><i style={{ width: `${Math.max((stage.count / maxStageCount) * 100, stage.count ? 12 : 4)}%` }} /></b>
                <strong>{stage.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="analytics-panel">
          <div className="panel-heading">
            <span className="eyebrow">Conexiones</span>
            <strong>Preparación operativa</strong>
          </div>
          <div className="analytics-tool-list">
            {toolItems.slice(0, 6).map((tool) => (
              <div className="analytics-tool-row" key={tool.key}>
                <span>{toolLabel(tool.name)}</span>
                <StatusPill status={tool.status} />
              </div>
            ))}
          </div>
        </article>
        <article className="analytics-panel events-panel">
          <div className="panel-heading">
            <span className="eyebrow">Ritmo reciente</span>
            <strong>Eventos principales</strong>
          </div>
          <div className="event-pill-list">
            {topEvents.map(({ type, label, count }) => (
              <div className="event-pill" key={type}>
                <span>{label}</span>
                <b>{count}</b>
              </div>
            ))}
            {!topEvents.length && <p className="muted-copy">Aún no hay eventos para analizar en esta tienda.</p>}
          </div>
        </article>
        <article className="analytics-panel risk-panel">
          <div className="panel-heading">
            <span className="eyebrow">Riesgos</span>
            <strong>{blockedCount ? 'Atención requerida' : 'Sin bloqueos críticos'}</strong>
          </div>
          <div className="risk-list">
            {conversationItems.filter((conversation) => ['blocked', 'degraded', 'needs_binding'].includes(conversation.status)).slice(0, 4).map((conversation) => (
              <button className="risk-row" key={conversation.id} type="button">
                <span>{conversation.customer}</span>
                <strong>{stageLabel(conversation.stage)}</strong>
              </button>
            ))}
            {!blockedCount && (
              <div className="risk-empty">
                <BadgeCheck size={18} />
                <span>El agente opera sin bloqueos visibles.</span>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function AnalyticsSignal({ detail, icon: Icon, label, tone, value }) {
  return (
    <article className={`analytics-signal is-${tone}`}>
      <Icon size={18} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function CapacityRing({ label, limit, percent, value }) {
  const safePercent = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div className="capacity-ring-card">
      <div className={`capacity-ring is-${usageTone(safePercent)}`} style={{ '--capacity': `${safePercent}%` }}>
        <strong>{Math.round(safePercent)}%</strong>
        <span>usado</span>
      </div>
      <div>
        <span>{label}</span>
        <strong>{formatUsageRatio(value, limit)}</strong>
        <small>{limit ? `${Math.max(limit - value, 0).toLocaleString('es-CO')} disponibles` : 'Sin límite configurado'}</small>
      </div>
    </div>
  );
}

function PlatformAdminView({ auth, error, overview, onOpenObservability, onSaveSettings }) {
  const llm = overview?.platform?.llm ?? {};
  const [llmDraft, setLlmDraft] = useState(() => ({
    model: llm.model ?? 'deepseek-chat',
    apiKeyRef: llm.apiKeyRef ?? 'DEEPSEEK_API_KEY',
    baseUrlRef: llm.baseUrlRef ?? 'DEEPSEEK_BASE_URL',
    simulator: llm.simulator ?? 'codex',
    maxTokens: llm.maxTokens ?? 1200,
    timeoutMs: llm.timeoutMs ?? 15000,
    temperature: llm.temperature ?? 0,
  }));
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [billingAdmin, setBillingAdmin] = useState({ plans: [], funnel: null, loading: true, error: '', lastJob: null });
  const [billingAction, setBillingAction] = useState('');

  useEffect(() => {
    setLlmDraft({
      model: llm.model ?? 'deepseek-chat',
      apiKeyRef: llm.apiKeyRef ?? 'DEEPSEEK_API_KEY',
      baseUrlRef: llm.baseUrlRef ?? 'DEEPSEEK_BASE_URL',
      simulator: llm.simulator ?? 'codex',
      maxTokens: llm.maxTokens ?? 1200,
      timeoutMs: llm.timeoutMs ?? 15000,
      temperature: llm.temperature ?? 0,
    });
  }, [llm.model, llm.apiKeyRef, llm.baseUrlRef, llm.simulator, llm.maxTokens, llm.timeoutMs, llm.temperature]);

  const tenants = overview?.tenants ?? [];
  const totals = overview?.totals ?? {};
  const webhookSummary = overview?.platform?.webhookSummary ?? {};

  async function loadBillingAdmin(silent = false) {
    if (!silent) setBillingAdmin((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [plansResponse, funnelResponse] = await Promise.all([
        appFetch('/api/admin/billing/plans', { credentials: 'include' }),
        appFetch('/api/admin/billing/funnel', { credentials: 'include' }),
      ]);
      if (!plansResponse.ok || !funnelResponse.ok) throw new Error('No fue posible leer facturación');
      const [plansPayload, funnelPayload] = await Promise.all([plansResponse.json(), funnelResponse.json()]);
      setBillingAdmin((current) => ({
        ...current,
        plans: plansPayload.plans ?? [],
        funnel: funnelPayload,
        loading: false,
        error: '',
      }));
    } catch (loadError) {
      setBillingAdmin((current) => ({
        ...current,
        loading: false,
        error: loadError.message ?? 'No fue posible leer facturación',
      }));
    }
  }

  useEffect(() => {
    if (!tenants.length) {
      setSelectedTenantId('');
      return;
    }
    if (!selectedTenantId || !tenants.some((tenant) => tenant.id === selectedTenantId)) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    let alive = true;
    loadBillingAdmin(false);
    const timer = window.setInterval(() => {
      if (alive) loadBillingAdmin(true);
    }, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  async function runBillingAdminAction(action, tenantId) {
    if (action !== 'jobs' && !tenantId) return;
    const actionKey = action === 'jobs' ? 'jobs:platform' : `${action}:${tenantId}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const routes = {
      jobs: '/api/admin/billing/jobs/run',
      sync: `/api/admin/billing/tenants/${tenantId}/sync`,
      exception: `/api/admin/billing/tenants/${tenantId}/exceptions`,
      discount: `/api/admin/billing/tenants/${tenantId}/discounts`,
    };
    const bodies = {
      jobs: {},
      sync: {},
      exception: { reason: 'Soporte comercial temporal', expiresAt },
      discount: { discountValue: 20, reason: 'Ajuste comercial piloto', expiresAt },
    };
    try {
      setBillingAction(actionKey);
      const response = await appFetch(routes[action], {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
        credentials: 'include',
        body: JSON.stringify(bodies[action] ?? {}),
      });
      if (!response.ok) throw new Error('No fue posible aplicar la acción');
      const actionPayload = await response.json().catch(() => null);
      const [plansResponse, funnelResponse] = await Promise.all([
        appFetch('/api/admin/billing/plans', { credentials: 'include' }),
        appFetch('/api/admin/billing/funnel', { credentials: 'include' }),
      ]);
      if (!plansResponse.ok || !funnelResponse.ok) throw new Error('La acción se aplicó, pero no fue posible refrescar facturación');
      const [plansPayload, funnelPayload] = await Promise.all([plansResponse.json(), funnelResponse.json()]);
      setBillingAdmin((current) => ({
        ...current,
        plans: plansPayload.plans ?? [],
        funnel: funnelPayload,
        loading: false,
        error: '',
        lastJob: action === 'jobs' ? actionPayload : current.lastJob,
      }));
    } catch (actionError) {
      setBillingAdmin((current) => ({
        ...current,
        loading: false,
        error: actionError.message ?? 'No fue posible aplicar la acción',
      }));
    } finally {
      setBillingAction('');
    }
  }

  async function saveBillingPlan(planId, payload) {
    const isNew = !planId;
    const actionKey = `plan:${planId ?? 'new'}`;
    const cleanPayload = {
      name: String(payload.name ?? '').trim(),
      description: String(payload.description ?? '').trim(),
      currency: 'COP',
      amount: Number(payload.amount ?? 0),
      billingFrequency: 'monthly',
      includedDeliveries: Number(payload.includedDeliveries ?? 0),
      includedInteractions: Number(payload.includedInteractions ?? 0),
      trialEnabled: Boolean(payload.trialEnabled),
      trialDays: Number(payload.trialDays ?? 0),
      graceDays: Number(payload.graceDays ?? 0),
      isActive: Boolean(payload.isActive),
      isDefault: Boolean(payload.isDefault),
    };
    try {
      setBillingAction(actionKey);
      const response = await appFetch(isNew ? '/api/admin/billing/plans' : `/api/admin/billing/plans/${planId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders(auth) },
        credentials: 'include',
        body: JSON.stringify(cleanPayload),
      });
      if (!response.ok) throw new Error('No fue posible guardar el plan');
      await loadBillingAdmin(false);
    } catch (planError) {
      setBillingAdmin((current) => ({
        ...current,
        loading: false,
        error: planError.message ?? 'No fue posible guardar el plan',
      }));
    } finally {
      setBillingAction('');
    }
  }

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null;
  const selectedTenantScore = tenantHealthScore(selectedTenant);
  const maxInteractions = Math.max(1, ...tenants.map((tenant) => Number(tenant.usage?.metrics?.agent_interactions ?? 0)));
  const maxWebhooks = Math.max(1, ...tenants.map((tenant) => Number(tenant.webhooks?.total ?? 0)));
  const selectedInteractions = Number(selectedTenant?.usage?.metrics?.agent_interactions ?? 0);
  const selectedTokens = Number(selectedTenant?.usage?.metrics?.llm_total_tokens ?? 0);
  return (
    <section className="admin-layout">
      <div className="admin-hero">
        <div>
          <span className="eyebrow">Consola del operador SaaS</span>
          <h2>Centro de control</h2>
          <p>Supervisa clientes, pagos, consumo, Motor IA y eventos de conexión desde una sola cabina.</p>
        </div>
        <div className="admin-hero-metrics">
          <AdminKpi label="Clientes" value={totals.tenants ?? tenants.length} />
          <AdminKpi label="Activos" value={totals.activeTenants ?? 0} />
          <AdminKpi label="Tokens IA" value={formatCompactNumber(totals.llmTokens ?? 0)} />
          <AdminKpi label="Eventos" value={webhookSummary.total ?? 0} />
        </div>
      </div>

      {error && (
        <div className="setup-error">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="admin-grid">
        <article className="admin-panel llm-control-panel">
          <div className="panel-heading-inline">
            <div>
              <span className="eyebrow">Motor IA global</span>
              <h3>DeepSeek de la plataforma</h3>
            </div>
            <StatusPill status={llm.configured ? 'production_ready' : 'needs_binding'} />
          </div>
          <p>Esta configuración aplica transversalmente a todos los clientes. El consumo se mide por tienda, pero la credencial y el modelo los opera la plataforma.</p>
          <div className="llm-form-grid">
            <label className="config-field">
              <span>
                <Bot size={16} />
                Modelo
              </span>
              <input value={llmDraft.model} onChange={(event) => setLlmDraft((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <label className="config-field">
              <span>
                <KeyRound size={16} />
                API key ref
              </span>
              <input value={llmDraft.apiKeyRef} onChange={(event) => setLlmDraft((current) => ({ ...current, apiKeyRef: event.target.value }))} />
            </label>
            <label className="config-field">
              <span>
                <Database size={16} />
                Base URL ref
              </span>
              <input value={llmDraft.baseUrlRef} onChange={(event) => setLlmDraft((current) => ({ ...current, baseUrlRef: event.target.value }))} />
            </label>
            <label className="config-field">
              <span>
                <Gauge size={16} />
                Simulador local
              </span>
              <select value={llmDraft.simulator ?? ''} onChange={(event) => setLlmDraft((current) => ({ ...current, simulator: event.target.value }))}>
                <option value="codex">Codex simula DeepSeek</option>
                <option value="codex_cli">Codex CLI local</option>
                <option value="">API real</option>
              </select>
            </label>
            <label className="config-field">
              <span>
                <Layers3 size={16} />
                Max tokens
              </span>
              <input type="number" value={llmDraft.maxTokens} onChange={(event) => setLlmDraft((current) => ({ ...current, maxTokens: event.target.value }))} />
            </label>
            <label className="config-field">
              <span>
                <Clock3 size={16} />
                Timeout ms
              </span>
              <input type="number" value={llmDraft.timeoutMs} onChange={(event) => setLlmDraft((current) => ({ ...current, timeoutMs: event.target.value }))} />
            </label>
          </div>
          <button className="approve-btn" type="button" onClick={() => onSaveSettings({ llm: llmDraft })}>
            <Check size={16} />
            Guardar Motor IA
          </button>
        </article>

        <article className="admin-panel tenant-watch-panel">
          <div className="panel-heading-inline">
            <div>
              <span className="eyebrow">Clientes</span>
              <h3>Radar comercial y operativo</h3>
            </div>
            <span className="admin-chip">{totals.paymentBlocked ?? 0} con riesgo de pago</span>
          </div>
          <div className="tenant-command-grid">
            <div className="tenant-watch-list">
              {tenants.map((tenant) => (
                <button className={`tenant-watch-row ${selectedTenant?.id === tenant.id ? 'is-selected' : ''}`} key={tenant.id} onClick={() => setSelectedTenantId(tenant.id)} type="button">
                  <div>
                    <strong>{tenant.name}</strong>
                    <span>{tenant.ownerEmail ?? tenant.id}</span>
                  </div>
                  <div className="tenant-watch-status">
                    <span className={`admin-dot is-${tenant.subscriptionStatus}`}></span>
                    <b>{humanState(tenant.subscriptionStatus)}</b>
                  </div>
                </button>
              ))}
            </div>

            {selectedTenant && (
              <aside className="tenant-radar-card">
                <div className="tenant-radar-top">
                  <TenantHealthDial score={selectedTenantScore} />
                  <div>
                    <span className="eyebrow">Cliente seleccionado</span>
                    <h4>{selectedTenant.name}</h4>
                    <p>{selectedTenant.ownerEmail ?? selectedTenant.id}</p>
                  </div>
                </div>
                <div className="tenant-signal-grid">
                  <TenantSignalCard icon={CircleDollarSign} label="Pago" value={humanState(selectedTenant.subscriptionStatus)} state={tenantSignalState(selectedTenant.subscriptionStatus, ['active', 'authorized'], ['pending', 'pending_payment', 'past_due', 'grace_period', 'payment_required'])} />
                  <TenantSignalCard icon={Database} label="Google" value={humanState(selectedTenant.googleWorkspaceStatus)} state={tenantSignalState(selectedTenant.googleWorkspaceStatus, ['ready', 'provisioned'], ['missing', 'pending'])} />
                  <TenantSignalCard icon={MessageCircle} label="WhatsApp" value={humanState(selectedTenant.whatsappStatus)} state={tenantSignalState(selectedTenant.whatsappStatus, ['connected'], ['missing'])} />
                  <TenantSignalCard icon={Activity} label="Acceso" value={humanState(selectedTenant.access)} state={tenantSignalState(selectedTenant.access, ['enabled', 'active'], ['limited', 'pending'])} />
                </div>
                <div className="tenant-usage-bars">
                  <MetricBar label="Interacciones" value={selectedInteractions} max={maxInteractions} tone="mint" />
                  <MetricBar label="Tokens IA" value={selectedTokens} max={Math.max(1, Number(totals.llmTokens ?? 0))} tone="gold" />
                  <MetricBar label="Eventos" value={selectedTenant.webhooks?.total ?? 0} max={maxWebhooks} tone="ink" />
                </div>
                <WebhookStatusBars summary={selectedTenant.webhooks ?? {}} />
                <div className="tenant-timeline">
                  <TenantTimelineStep label="Pago" state={tenantSignalState(selectedTenant.subscriptionStatus, ['active', 'authorized'], ['pending', 'pending_payment', 'past_due', 'grace_period'])} />
                  <TenantTimelineStep label="Google" state={tenantSignalState(selectedTenant.googleWorkspaceStatus, ['ready', 'provisioned'], ['pending'])} />
                  <TenantTimelineStep label="WhatsApp" state={tenantSignalState(selectedTenant.whatsappStatus, ['connected'], ['missing'])} />
                  <TenantTimelineStep label="Operación" state={selectedTenant.lastError ? 'bad' : 'ok'} />
                </div>
              </aside>
            )}
          </div>
        </article>
      </div>

      <BillingAdminPanel
        billing={billingAdmin}
        busyAction={billingAction}
        onAction={runBillingAdminAction}
        onSavePlan={saveBillingPlan}
        selectedTenant={selectedTenant}
        totals={totals}
      />

      <article className="admin-panel observability-entry-panel">
        <div className="panel-heading-inline">
          <div>
            <span className="eyebrow">Observabilidad</span>
            <h3>Eventos de conexión separados del control comercial</h3>
          </div>
          <button className="approve-btn compact" type="button" onClick={onOpenObservability}>
            <Activity size={16} />
            Abrir observabilidad
          </button>
        </div>
        <p>Los eventos de WhatsApp, Mercado Pago y futuras integraciones se investigan en una cabina propia, con filtros por tienda, proveedor, estado y rango de fechas.</p>
        <div className="webhook-kpis">
          <AdminKpi label="Eventos" value={webhookSummary.total ?? 0} />
          <AdminKpi label="Procesados" value={webhookSummary.processed ?? 0} />
          <AdminKpi label="Errores" value={webhookSummary.failed ?? 0} />
          <AdminKpi label="Promedio" value={`${webhookSummary.avgDurationMs ?? 0} ms`} />
        </div>
      </article>
    </section>
  );
}

function billingPlanDraft(plan) {
  return {
    name: plan?.name ?? 'Plan crecimiento',
    description: plan?.description ?? 'Plan mensual para comercios con mayor volumen operativo.',
    amount: plan?.amount ?? 129000,
    includedDeliveries: plan?.includedDeliveries ?? 1500,
    includedInteractions: plan?.includedInteractions ?? 7500,
    trialEnabled: Boolean(plan?.trialEnabled ?? false),
    trialDays: Number(plan?.trialDays ?? 0),
    graceDays: Number(plan?.graceDays ?? 5),
    isActive: Boolean(plan?.isActive ?? true),
    isDefault: Boolean(plan?.isDefault ?? false),
  };
}

function BillingAdminPanel({ billing, busyAction, onAction, onSavePlan, selectedTenant, totals }) {
  const plans = billing?.plans ?? [];
  const activePlans = plans.filter((plan) => plan.isActive);
  const defaultPlan = plans.find((plan) => plan.isDefault) ?? activePlans[0] ?? plans[0] ?? null;
  const stages = billing?.funnel?.stages ?? [];
  const recentEvents = billing?.funnel?.events?.slice(0, 4) ?? [];
  const maxStageTotal = Math.max(1, ...stages.map((stage) => Number(stage.total ?? 0)));
  const selectedTenantId = selectedTenant?.id;
  const selectedTenantBlocked = ['pending_payment', 'past_due', 'expired', 'cancelled', 'suspended', 'payment_required'].includes(selectedTenant?.subscriptionStatus);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan?.id ?? '');
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState(() => billingPlanDraft(defaultPlan));
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? defaultPlan;
  const savingPlan = busyAction.startsWith('plan:');
  const canSavePlan = planDraft.name.trim() && Number(planDraft.amount) > 0 && Number(planDraft.includedDeliveries) > 0 && Number(planDraft.includedInteractions) > 0;

  useEffect(() => {
    if (creatingPlan) return;
    const nextId = selectedPlanId && plans.some((plan) => plan.id === selectedPlanId) ? selectedPlanId : defaultPlan?.id ?? plans[0]?.id ?? '';
    if (nextId !== selectedPlanId) {
      setSelectedPlanId(nextId);
      return;
    }
    const nextPlan = plans.find((plan) => plan.id === nextId) ?? defaultPlan;
    setPlanDraft(billingPlanDraft(nextPlan));
  }, [plans, defaultPlan?.id, selectedPlanId, creatingPlan]);

  function selectPlan(plan) {
    setCreatingPlan(false);
    setSelectedPlanId(plan.id);
    setPlanDraft(billingPlanDraft(plan));
  }

  function startNewPlan() {
    setCreatingPlan(true);
    setSelectedPlanId('');
    setPlanDraft(billingPlanDraft(null));
  }

  async function submitPlan(event) {
    event.preventDefault();
    if (!canSavePlan || savingPlan) return;
    await onSavePlan(creatingPlan ? null : selectedPlanId, planDraft);
    setCreatingPlan(false);
  }

  function quickPlanPatch(plan, patch) {
    onSavePlan(plan.id, { ...billingPlanDraft(plan), ...patch });
  }

  return (
    <article className="admin-panel billing-admin-panel">
      <div className="panel-heading-inline">
        <div>
          <span className="eyebrow">Mercado Pago</span>
          <h3>Facturación y acceso</h3>
          <p>Administra planes, cobros recurrentes y excepciones comerciales sin tocar la operación diaria de la tienda.</p>
        </div>
        <div className="billing-admin-toolbar">
          <button className="ghost-btn compact" type="button" onClick={() => onAction('jobs')} disabled={busyAction === 'jobs:platform'}>
            <RotateCcw size={15} />
            Conciliar ahora
          </button>
          <span className={`admin-chip ${billing?.loading || busyAction === 'jobs:platform' ? 'is-busy' : ''}`}>
            {billing?.loading || busyAction === 'jobs:platform' ? 'Actualizando' : `${totals?.paymentBlocked ?? 0} con pago pendiente`}
          </span>
        </div>
      </div>

      {billing?.error && (
        <div className="setup-error">
          <AlertTriangle size={17} />
          <span>{billing.error}</span>
        </div>
      )}

      {billing?.lastJob && (
        <div className="billing-job-strip">
          <span>Última conciliación</span>
          <strong>{formatCompactNumber(billing.lastJob.actions?.length ?? 0)} cambios</strong>
          <b>{formatCompactNumber(billing.lastJob.checkoutExpired ?? 0)} checkout · {formatCompactNumber(billing.lastJob.enteredGrace ?? 0)} gracia · {formatCompactNumber(billing.lastJob.suspended ?? 0)} suspendidos</b>
        </div>
      )}

      <div className="billing-admin-grid">
        <section className="billing-plan-console">
          <div className="billing-section-title with-action">
            <div>
              <span>Planes comerciales</span>
              <strong>{defaultPlan?.name ?? 'Sin plan principal'}</strong>
            </div>
            <button className="ghost-btn compact" type="button" onClick={startNewPlan} disabled={savingPlan}>
              <CircleDollarSign size={15} />
              Nuevo plan
            </button>
          </div>

          <div className="billing-plan-workbench">
            <div className="billing-plan-list">
              {plans.map((plan) => (
                <button className={`billing-plan-row ${selectedPlan?.id === plan.id && !creatingPlan ? 'is-selected' : ''}`} key={plan.id} onClick={() => selectPlan(plan)} type="button">
                  <div>
                    <strong>{plan.name}</strong>
                    <span>{formatCurrency(plan.amount, plan.currency)} · {formatCompactNumber(plan.includedDeliveries)} domicilios</span>
                  </div>
                  <div className="billing-plan-row-tags">
                    {plan.isDefault && <span>Principal</span>}
                    <span className={plan.isActive ? 'is-active' : 'is-muted'}>{plan.isActive ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </button>
              ))}
            </div>

            <form className="billing-plan-form" onSubmit={submitPlan}>
              <div className="billing-form-head">
                <div>
                  <span>{creatingPlan ? 'Nuevo plan' : 'Editar plan'}</span>
                  <strong>{creatingPlan ? 'Configurar oferta' : selectedPlan?.name ?? 'Plan seleccionado'}</strong>
                </div>
                <span className="admin-chip">{activePlans.length} activos</span>
              </div>
              <div className="billing-plan-fields">
                <label className="config-field span-2">
                  <span>Nombre comercial</span>
                  <input value={planDraft.name} onChange={(event) => setPlanDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="config-field">
                  <span>Valor mensual COP</span>
                  <input type="number" min="0" step="1000" value={planDraft.amount} onChange={(event) => setPlanDraft((current) => ({ ...current, amount: event.target.value }))} />
                </label>
                <label className="config-field">
                  <span>Domicilios incluidos</span>
                  <input type="number" min="1" value={planDraft.includedDeliveries} onChange={(event) => setPlanDraft((current) => ({ ...current, includedDeliveries: event.target.value }))} />
                </label>
                <label className="config-field">
                  <span>Interacciones incluidas</span>
                  <input type="number" min="1" value={planDraft.includedInteractions} onChange={(event) => setPlanDraft((current) => ({ ...current, includedInteractions: event.target.value }))} />
                </label>
                <label className="config-field">
                  <span>Días de gracia</span>
                  <input type="number" min="0" value={planDraft.graceDays} onChange={(event) => setPlanDraft((current) => ({ ...current, graceDays: event.target.value }))} />
                </label>
                <label className="config-field">
                  <span>Días de prueba</span>
                  <input type="number" min="0" disabled={!planDraft.trialEnabled} value={planDraft.trialDays} onChange={(event) => setPlanDraft((current) => ({ ...current, trialDays: event.target.value }))} />
                </label>
              </div>
              <div className="billing-plan-switches">
                <label>
                  <input type="checkbox" checked={planDraft.isActive} onChange={(event) => setPlanDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>Plan activo</span>
                </label>
                <label>
                  <input type="checkbox" checked={planDraft.isDefault} onChange={(event) => setPlanDraft((current) => ({ ...current, isDefault: event.target.checked, isActive: event.target.checked ? true : current.isActive }))} />
                  <span>Plan principal</span>
                </label>
                <label>
                  <input type="checkbox" checked={planDraft.trialEnabled} onChange={(event) => setPlanDraft((current) => ({ ...current, trialEnabled: event.target.checked, trialDays: event.target.checked ? current.trialDays || 5 : 0 }))} />
                  <span>Prueba gratis</span>
                </label>
              </div>
              <div className="billing-plan-actions">
                {!creatingPlan && selectedPlan && (
                  <>
                    <button className="ghost-btn compact" type="button" onClick={() => quickPlanPatch(selectedPlan, { isActive: !selectedPlan.isActive })} disabled={savingPlan || selectedPlan.isDefault}>
                      {selectedPlan.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="ghost-btn compact" type="button" onClick={() => quickPlanPatch(selectedPlan, { isDefault: true, isActive: true })} disabled={savingPlan || selectedPlan.isDefault}>
                      Marcar principal
                    </button>
                  </>
                )}
                <button className="approve-btn compact" type="submit" disabled={!canSavePlan || savingPlan}>
                  <Check size={15} />
                  {creatingPlan ? 'Crear plan' : 'Guardar plan'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="billing-funnel-panel">
          <div className="billing-section-title">
            <span>Embudo de activación</span>
            <strong>{recentEvents.length ? 'Actividad reciente' : 'Esperando actividad'}</strong>
          </div>
          <div className="billing-funnel-list">
            {stages.slice(0, 8).map((stage) => (
              <div className="billing-funnel-step" key={stage.stage}>
                <span>{billingStageLabel(stage.stage)}</span>
                <b><i style={{ width: `${Math.max((Number(stage.total ?? 0) / maxStageTotal) * 100, stage.total ? 10 : 4)}%` }} /></b>
                <strong>{stage.total ?? 0}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="billing-tenant-control">
          <div className="billing-section-title">
            <span>Cliente seleccionado</span>
            <strong>{selectedTenant?.name ?? 'Selecciona un cliente'}</strong>
          </div>
          <div className="billing-tenant-state">
            <span className={`billing-state is-${selectedTenant?.subscriptionStatus ?? 'missing'}`}>{humanState(selectedTenant?.subscriptionStatus)}</span>
            <p>{selectedTenantBlocked ? 'Requiere atención para recuperar acceso o cobro.' : 'Acceso comercial estable.'}</p>
          </div>
          <div className="billing-admin-actions">
            <button className="ghost-btn" type="button" onClick={() => onAction('sync', selectedTenantId)} disabled={!selectedTenantId || busyAction === `sync:${selectedTenantId}`}>
              <RotateCcw size={15} />
              Sincronizar
            </button>
            <button className="ghost-btn" type="button" onClick={() => onAction('exception', selectedTenantId)} disabled={!selectedTenantId || busyAction === `exception:${selectedTenantId}`}>
              <ShieldCheck size={15} />
              Excepción 48h
            </button>
            <button className="ghost-btn" type="button" onClick={() => onAction('discount', selectedTenantId)} disabled={!selectedTenantId || busyAction === `discount:${selectedTenantId}`}>
              <CircleDollarSign size={15} />
              Descuento piloto
            </button>
          </div>
        </section>
      </div>
    </article>
  );
}

function ObservabilityView({ overview }) {
  const tenants = overview?.tenants ?? [];
  const [webhookFilters, setWebhookFilters] = useState({ tenantId: '', provider: '', status: '', from: '', to: '', q: '' });
  const [webhookData, setWebhookData] = useState({ summary: overview?.platform?.webhookSummary ?? {}, events: overview?.recentWebhooks ?? [] });
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [selectedWebhookId, setSelectedWebhookId] = useState('');
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [selectedWebhookBusy, setSelectedWebhookBusy] = useState(false);
  const [monitorGranularity, setMonitorGranularity] = useState('hour');

  useEffect(() => {
    let cancelled = false;
    async function loadWebhooks() {
      setWebhookBusy(true);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(webhookFilters)) {
        if (value) params.set(key, value);
      }
      params.set('limit', '500');
      try {
        const response = await appFetch(`/api/admin/webhooks?${params}`, { credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setWebhookData(payload);
      } finally {
        if (!cancelled) setWebhookBusy(false);
      }
    }
    loadWebhooks();
    const timer = window.setInterval(loadWebhooks, 7000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [webhookFilters]);

  useEffect(() => {
    const events = webhookData.events ?? [];
    if (!events.length) {
      setSelectedWebhook(null);
      setSelectedWebhookId('');
      return;
    }
    if (!selectedWebhookId || !events.some((event) => event.id === selectedWebhookId)) {
      openWebhookDetail(events[0].id);
    }
  }, [webhookData.events]);

  async function openWebhookDetail(id) {
    setSelectedWebhookId(id);
    setSelectedWebhookBusy(true);
    try {
      const response = await appFetch(`/api/admin/webhooks/${encodeURIComponent(id)}`, { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (response.ok) setSelectedWebhook(payload);
    } finally {
      setSelectedWebhookBusy(false);
    }
  }

  const webhookSummary = webhookData.summary ?? {};
  return (
    <section className="observability-layout">
      <article className="admin-panel webhook-console">
        <div className="panel-heading-inline">
          <div>
            <span className="eyebrow">Eventos de conexión</span>
            <h3>Monitor en vivo e histórico</h3>
          </div>
          <span className={`admin-chip ${webhookBusy ? 'is-busy' : ''}`}>{webhookBusy ? 'Actualizando' : 'En vivo local'}</span>
        </div>
        <p>Investiga integraciones sin mezclar la operación comercial: filtra por tienda, proveedor, estado, fecha o identificador externo.</p>
        <div className="webhook-filters">
          <label className="config-field">
            <span>
              <Store size={16} />
              Cliente / tienda
            </span>
            <select value={webhookFilters.tenantId} onChange={(event) => setWebhookFilters((current) => ({ ...current, tenantId: event.target.value }))}>
              <option value="">Todas</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </label>
          <label className="config-field">
            <span>
              <PlugZap size={16} />
              Proveedor
            </span>
            <select value={webhookFilters.provider} onChange={(event) => setWebhookFilters((current) => ({ ...current, provider: event.target.value }))}>
              <option value="">Todos</option>
              <option value="meta_whatsapp_cloud_api">WhatsApp</option>
              <option value="mercado_pago">Mercado Pago</option>
            </select>
          </label>
          <label className="config-field">
            <span>
              <ListFilter size={16} />
              Estado
            </span>
            <select value={webhookFilters.status} onChange={(event) => setWebhookFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Todos</option>
              <option value="processed">Procesado</option>
              <option value="duplicate">Duplicado</option>
              <option value="ignored">Ignorado</option>
              <option value="rejected">Rechazado</option>
              <option value="failed">Error</option>
            </select>
          </label>
          <label className="config-field">
            <span>
              <Search size={16} />
              Buscar
            </span>
            <input value={webhookFilters.q} onChange={(event) => setWebhookFilters((current) => ({ ...current, q: event.target.value }))} placeholder="ID, tienda, error" />
          </label>
          <label className="config-field">
            <span>
              <Clock3 size={16} />
              Desde
            </span>
            <input type="datetime-local" value={webhookFilters.from} onChange={(event) => setWebhookFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <Clock3 size={16} />
              Hasta
            </span>
            <input type="datetime-local" value={webhookFilters.to} onChange={(event) => setWebhookFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
        </div>
        <AdminWebhookMonitor
          events={webhookData.events ?? []}
          granularity={monitorGranularity}
          onGranularityChange={setMonitorGranularity}
          summary={webhookSummary}
        />
        <div className="webhook-kpis">
          <AdminKpi label="Procesados" value={webhookSummary.processed ?? 0} />
          <AdminKpi label="Errores" value={webhookSummary.failed ?? 0} />
          <AdminKpi label="Rechazados" value={webhookSummary.rejected ?? 0} />
          <AdminKpi label="Promedio" value={`${webhookSummary.avgDurationMs ?? 0} ms`} />
        </div>
        <div className="webhook-investigation-grid">
          <div className="webhook-table">
            {(webhookData.events ?? []).map((event) => (
              <button className={`webhook-row ${selectedWebhookId === event.id ? 'is-selected' : ''}`} key={event.id} onClick={() => openWebhookDetail(event.id)} type="button">
                <time>{formatDateTime(event.receivedAt)}</time>
                <strong>{providerLabel(event.provider)}</strong>
                <span>{event.tenantId ?? 'Sin tienda'}</span>
                <span>{event.eventType}</span>
                <b className={`webhook-status is-${event.status}`}>{eventStatusLabel(event.status)}</b>
                <code>{event.externalId ?? event.errorCode ?? event.id}</code>
                <span>{event.durationMs ?? 0} ms</span>
              </button>
            ))}
            {!(webhookData.events ?? []).length && (
              <div className="empty-state">
                <PlugZap size={24} />
                <h3>Sin eventos para el filtro</h3>
                <p>Cuando entren eventos de WhatsApp o Mercado Pago aparecerán aquí con trazabilidad completa.</p>
              </div>
            )}
          </div>

          <aside className="webhook-detail-panel">
            <div className="panel-heading-inline">
              <div>
                <span className="eyebrow">Detalle técnico</span>
                <h3>{selectedWebhook ? providerLabel(selectedWebhook.provider) : 'Selecciona un evento'}</h3>
              </div>
              {selectedWebhookBusy && <span className="admin-chip is-busy">Cargando</span>}
            </div>
            {selectedWebhook ? (
              <>
                <div className="webhook-detail-summary">
                  <ResourceRow icon={Store} label="Cliente / tienda" value={selectedWebhook.tenantId ?? 'No resuelto'} />
                  <ResourceRow icon={PlugZap} label="Estado" value={eventStatusLabel(selectedWebhook.status)} />
                  <ResourceRow icon={Clock3} label="Recibido" value={formatFullDateTime(selectedWebhook.receivedAt)} />
                  <ResourceRow icon={Gauge} label="Duración" value={`${selectedWebhook.durationMs ?? 0} ms`} />
                  <ResourceRow icon={MessageCircle} label="Externo" value={selectedWebhook.externalId ?? 'Sin ID'} />
                  <ResourceRow icon={MessageSquareText} label="Conversación" value={selectedWebhook.conversationId ?? 'No aplica'} />
                </div>
                {(selectedWebhook.errorCode || selectedWebhook.errorMessage) && (
                  <div className="webhook-error-box">
                    <AlertTriangle size={17} />
                    <div>
                      <strong>{selectedWebhook.errorCode ?? 'error'}</strong>
                      <span>{selectedWebhook.errorMessage}</span>
                    </div>
                  </div>
                )}
                <WebhookJsonBlock title="Payload enmascarado" value={selectedWebhook.payloadRedacted} />
                <WebhookJsonBlock title="Headers enmascarados" value={selectedWebhook.headersRedacted} />
                <WebhookJsonBlock title="Metadata" value={selectedWebhook.metadata} />
              </>
            ) : (
              <div className="empty-state webhook-detail-empty">
                <Eye size={24} />
                <h3>Sin evento seleccionado</h3>
                <p>El detalle muestra datos sensibles enmascarados, resultado, error y trazabilidad técnica.</p>
              </div>
            )}
          </aside>
        </div>
      </article>
    </section>
  );
}

function WebhookJsonBlock({ title, value }) {
  return (
    <details className="webhook-json-block" open={title === 'Payload enmascarado'}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(value ?? {}, null, 2)}</pre>
    </details>
  );
}

function AdminWebhookMonitor({ events, granularity, onGranularityChange, summary }) {
  const timeline = buildWebhookTimeline(events, granularity);
  const peak = Math.max(1, ...timeline.map((bucket) => bucket.total));
  const processed = Number(summary.processed ?? 0);
  const failed = Number(summary.failed ?? 0);
  const total = Number(summary.total ?? events.length ?? 0);
  const successRate = total ? Math.round((processed / total) * 100) : 0;
  const peakBucket = timeline.reduce((best, bucket) => (bucket.total > best.total ? bucket : best), timeline[0] ?? { total: 0, label: 'Sin datos' });
  const whatsappCount = events.filter((event) => event.provider === 'meta_whatsapp_cloud_api').length;
  const mercadoPagoCount = events.filter((event) => event.provider === 'mercado_pago').length;
  return (
    <section className="webhook-monitor">
      <div className="webhook-monitor-top">
        <div>
          <span className="eyebrow">Monitor vivo</span>
          <h4>Ritmo histórico de eventos</h4>
        </div>
        <div className="segmented-control" aria-label="Agrupar eventos">
          <button className={granularity === 'hour' ? 'is-active' : ''} type="button" onClick={() => onGranularityChange('hour')}>Hora</button>
          <button className={granularity === 'day' ? 'is-active' : ''} type="button" onClick={() => onGranularityChange('day')}>Día</button>
        </div>
      </div>
      <div className="webhook-monitor-grid">
        <div className="webhook-chart-card">
          <WebhookTimelineChart peak={peak} timeline={timeline} />
          <div className="webhook-chart-axis">
            <span>{timeline[0]?.label ?? 'Sin inicio'}</span>
            <span>{timeline.at(-1)?.label ?? 'Sin fin'}</span>
          </div>
        </div>
        <div className="webhook-monitor-side">
          <AdminKpi label="Éxito" value={`${successRate}%`} />
          <AdminKpi label="Pico" value={`${peakBucket.total} evt`} />
          <AdminKpi label="Errores" value={failed} />
          <div className="provider-mix">
            <div>
              <span>WhatsApp</span>
              <strong>{whatsappCount}</strong>
            </div>
            <div>
              <span>Mercado Pago</span>
              <strong>{mercadoPagoCount}</strong>
            </div>
            <MetricBar label={peakBucket.label} value={peakBucket.total} max={peak} tone="mint" />
          </div>
        </div>
      </div>
    </section>
  );
}

function WebhookTimelineChart({ peak, timeline }) {
  const width = 720;
  const height = 220;
  const padX = 30;
  const padBottom = 28;
  const padTop = 18;
  const usableHeight = height - padTop - padBottom;
  const points = timeline.map((bucket, index) => {
    const x = timeline.length <= 1 ? width / 2 : padX + (index / (timeline.length - 1)) * (width - padX * 2);
    const y = padTop + usableHeight - (bucket.total / peak) * usableHeight;
    const failedY = padTop + usableHeight - (bucket.failed / peak) * usableHeight;
    return { ...bucket, x, y, failedY };
  });
  const baseline = height - padBottom;
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x.toFixed(1)} ${baseline} ${points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')} L ${points.at(-1).x.toFixed(1)} ${baseline} Z`
    : '';
  return (
    <svg className="webhook-timeline-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
      {[0.25, 0.5, 0.75, 1].map((line) => (
        <line className="chart-grid-line" key={line} x1={padX} x2={width - padX} y1={padTop + usableHeight * line} y2={padTop + usableHeight * line} />
      ))}
      {points.length ? (
        <>
          <path className="chart-area" d={areaPath} />
          <path className="chart-line" d={linePath} />
          {points.map((point) => (
            <g key={point.key}>
              <rect className="chart-failed-bar" x={point.x - 4} y={point.failedY} width="8" height={Math.max(0, baseline - point.failedY)} rx="4" />
              <circle className={`chart-point ${point.failed ? 'has-failures' : ''}`} cx={point.x} cy={point.y} r={point.total ? 5 : 3} />
            </g>
          ))}
        </>
      ) : (
        <text className="chart-empty-label" x={width / 2} y={height / 2}>Sin eventos en esta ventana</text>
      )}
    </svg>
  );
}

function AdminKpi({ label, value }) {
  return (
    <div className="admin-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TenantHealthDial({ score }) {
  const tone = score >= 82 ? 'ok' : score >= 62 ? 'warn' : 'bad';
  return (
    <div className={`tenant-health-dial is-${tone}`} style={{ '--score': `${Math.max(0, Math.min(score, 100))}%` }}>
      <strong>{score}</strong>
      <span>salud</span>
    </div>
  );
}

function TenantSignalCard({ icon: Icon, label, value, state }) {
  return (
    <div className={`tenant-signal-card is-${state}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value ?? 'Pendiente'}</strong>
    </div>
  );
}

function MetricBar({ label, value, max, tone }) {
  const percent = Math.min(100, Math.round((Number(value ?? 0) / Math.max(1, Number(max ?? 1))) * 100));
  return (
    <div className={`metric-bar is-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{formatCompactNumber(value)}</strong>
      </div>
      <b>
        <i style={{ width: `${percent}%` }} />
      </b>
    </div>
  );
}

function WebhookStatusBars({ summary }) {
  const statuses = [
    ['Procesados', summary.processed ?? summary.byStatus?.processed ?? 0, 'ok'],
    ['Duplicados', summary.duplicates ?? summary.byStatus?.duplicate ?? 0, 'warn'],
    ['Ignorados', summary.ignored ?? summary.byStatus?.ignored ?? 0, 'warn'],
    ['Fallidos', summary.failed ?? 0, 'bad'],
  ];
  const max = Math.max(1, ...statuses.map(([, value]) => Number(value ?? 0)));
  return (
    <div className="webhook-status-bars">
      {statuses.map(([label, value, tone]) => (
        <div className={`webhook-status-bar is-${tone}`} key={label}>
          <span>{label}</span>
          <b><i style={{ height: `${Math.max(8, (Number(value) / max) * 100)}%` }} /></b>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TenantTimelineStep({ label, state }) {
  return (
    <div className={`tenant-timeline-step is-${state}`}>
      <span />
      <strong>{label}</strong>
    </div>
  );
}

function tenantHealthScore(tenant) {
  if (!tenant) return 0;
  let score = 0;
  score += ['active', 'authorized'].includes(tenant.subscriptionStatus)
    ? 25
    : ['pending', 'pending_payment', 'past_due', 'grace_period', 'payment_required'].includes(tenant.subscriptionStatus)
      ? 10
      : 0;
  score += ['ready', 'provisioned'].includes(tenant.googleWorkspaceStatus) ? 25 : tenant.googleStatus === 'authorized' ? 18 : 0;
  score += tenant.whatsappStatus === 'connected' ? 20 : 0;
  score += ['enabled', 'active'].includes(tenant.access) ? 15 : 0;
  score += tenant.lastError ? 0 : 15;
  return Math.max(0, Math.min(100, score));
}

function tenantSignalState(value, okValues, warnValues = []) {
  if (okValues.includes(value)) return 'ok';
  if (warnValues.includes(value)) return 'warn';
  return 'bad';
}

function humanState(value) {
  const labels = {
    active: 'Activo',
    authorized: 'Autorizado',
    pending: 'Pendiente',
    pending_payment: 'Pago pendiente',
    past_due: 'Pago atrasado',
    grace_period: 'En gracia',
    payment_required: 'Pago pendiente',
    expired: 'Vencido',
    cancelled: 'Cancelado',
    suspended: 'Suspendido',
    paused: 'Pausado',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    ready: 'Listo',
    provisioned: 'Aprovisionado',
    missing: 'Pendiente',
    connected: 'Conectado',
    enabled: 'Habilitado',
    limited: 'Limitado',
    inactive: 'Inactivo',
  };
  return labels[value] ?? value ?? 'Pendiente';
}

function billingStageLabel(value) {
  const labels = {
    account_created: 'Cuenta creada',
    diagnosis_started: 'Diagnóstico iniciado',
    diagnosis_completed: 'Diagnóstico listo',
    checkout_started: 'Checkout iniciado',
    payment_confirmed: 'Pago confirmado',
    google_connected: 'Google conectado',
    whatsapp_configured: 'WhatsApp listo',
    store_activated: 'Tienda activa',
    blocked: 'Bloqueo registrado',
  };
  return labels[value] ?? humanState(value);
}

function eventStatusLabel(value) {
  const labels = {
    processed: 'Procesado',
    duplicate: 'Duplicado',
    ignored: 'Ignorado',
    rejected: 'Rechazado',
    failed: 'Error',
  };
  return labels[value] ?? value ?? 'Sin estado';
}

function planLabel(value) {
  const labels = {
    'Production pilot': 'Piloto productivo',
    'Design binding': 'Conexión en curso',
    'Human review': 'Revisión asistida',
    'ventas ia 1000 domicilios': 'Plan 1.000 domicilios',
    ventas_ia_1000_domicilios: 'Plan 1.000 domicilios',
  };
  return labels[value] ?? value;
}

function sourceLabel(value = '') {
  if (value.includes('whatsapp')) return 'Canal WhatsApp';
  if (value.includes('google-sheets')) return 'Google Sheets';
  if (value.includes('google-drive')) return 'Google Drive';
  if (value.includes('approval')) return 'Aprobación humana';
  if (value.includes('human-handoff')) return 'Escalamiento humano';
  if (value.includes('transactional')) return 'Registro transaccional';
  return value ? 'Conexión operativa' : 'Sin origen';
}

function stageLabel(value) {
  const labels = {
    catalog: 'Búsqueda en catálogo',
    approval: 'Revisión humana',
    handoff: 'Acompañamiento humano',
    binding: 'Conexión pendiente',
    payment: 'Pago y cierre',
    off_hours: 'Fuera de horario',
  };
  return labels[value] ?? value ?? 'Sin etapa';
}

function toolLabel(value) {
  const labels = {
    approval_gate: 'Aprobación humana',
    human_handoff: 'Escalamiento humano',
    transactional_write: 'Registro del pedido',
    google_sheets_read_table: 'Consulta de catálogo',
    google_drive_file_picker: 'Documentos de tienda',
    google_sheets_customer_profile_lookup: 'Consulta de cliente',
    google_sheets_customer_profile_upsert: 'Actualización de cliente',
    google_sheets_order_write: 'Registro del pedido',
    whatsapp_business_messaging: 'Canal WhatsApp',
    scheduler: 'Programación de atención',
    planner: 'Razonamiento del agente',
  };
  return labels[value] ?? sourceLabel(value);
}

function riskLabel(value) {
  const labels = {
    low: 'Bajo',
    medium: 'Medio',
    high: 'Alto',
  };
  return labels[value] ?? value ?? 'Sin riesgo';
}

function eventTypeLabel(value) {
  const labels = {
    'approval.requested': 'Apoyo humano solicitado',
    'approval.granted': 'Aprobación registrada',
    'fallback.activated': 'Ruta alternativa activada',
    'auth.login': 'Inicio de sesión',
    human_handoff: 'Escalamiento humano',
    'tool.binding.changed': 'Conexión pendiente',
  };
  return labels[value] ?? value ?? 'Evento';
}

function formatEventTime(value) {
  if (!value) return '';
  if (String(value).includes('T')) return formatDateTime(value);
  return value;
}

function buildWebhookTimeline(events, granularity) {
  const validEvents = events
    .map((event) => ({ ...event, date: new Date(event.receivedAt) }))
    .filter((event) => !Number.isNaN(event.date.getTime()))
    .sort((left, right) => left.date - right.date);
  if (!validEvents.length) return [];
  const bucketMs = granularity === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const maxBuckets = granularity === 'day' ? 31 : 30;
  const end = floorWebhookBucket(validEvents.at(-1).date, granularity);
  let start = floorWebhookBucket(validEvents[0].date, granularity);
  if (validEvents.length === 1 || end - start > (maxBuckets - 1) * bucketMs) {
    start = new Date(end.getTime() - (maxBuckets - 1) * bucketMs);
  }
  const buckets = new Map();
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + bucketMs)) {
    const key = cursor.toISOString();
    buckets.set(key, {
      key,
      label: formatWebhookBucketLabel(cursor, granularity),
      total: 0,
      processed: 0,
      failed: 0,
      whatsapp: 0,
      mercadoPago: 0,
    });
  }
  for (const event of validEvents) {
    const bucketDate = floorWebhookBucket(event.date, granularity);
    if (bucketDate < start || bucketDate > end) continue;
    const key = bucketDate.toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (event.status === 'processed') bucket.processed += 1;
    if (['failed', 'rejected'].includes(event.status)) bucket.failed += 1;
    if (event.provider === 'meta_whatsapp_cloud_api') bucket.whatsapp += 1;
    if (event.provider === 'mercado_pago') bucket.mercadoPago += 1;
  }
  return [...buckets.values()];
}

function floorWebhookBucket(value, granularity) {
  const date = new Date(value);
  if (granularity === 'day') {
    date.setHours(0, 0, 0, 0);
    return date;
  }
  date.setMinutes(0, 0, 0);
  return date;
}

function formatWebhookBucketLabel(value, granularity) {
  if (granularity === 'day') {
    return new Intl.DateTimeFormat('es-CO', { month: 'short', day: '2-digit' }).format(value);
  }
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function providerLabel(provider) {
  if (provider === 'meta_whatsapp_cloud_api') return 'WhatsApp';
  if (provider === 'mercado_pago') return 'Mercado Pago';
  return provider ?? 'Evento';
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFullDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function Configuration({ onSaveConfig, tenant, tools: toolList }) {
  const [llmDraft, setLlmDraft] = useState(() => ({
    phoneNumberId: tenant.config?.whatsapp?.phoneNumberId ?? '',
    phoneNumberIdRef: tenant.config?.whatsapp?.phoneNumberIdRef ?? `${tenant.id.toUpperCase()}_WHATSAPP_PHONE_NUMBER_ID_REF`,
    accessTokenRef: tenant.config?.whatsapp?.accessTokenRef ?? 'WHATSAPP_ACCESS_TOKEN_REF',
    verifyTokenRef: tenant.config?.whatsapp?.verifyTokenRef ?? 'WHATSAPP_WEBHOOK_VERIFY_TOKEN_REF',
    appSecretRef: tenant.config?.whatsapp?.appSecretRef ?? 'WHATSAPP_APP_SECRET_REF',
    tone: tenant.config?.agentPolicy?.tone ?? 'tendero_bogotano',
    humanEscalation: tenant.config?.agentPolicy?.humanEscalation ?? true,
    customerProfilesRange: tenant.config?.googleSheets?.customerProfilesRange ?? 'Clientes!A1:F500',
    ordersRange: tenant.config?.googleSheets?.ordersRange ?? 'Pedidos!A1:K500',
    missingQuantity: tenant.config?.agentPolicy?.missingQuantity ?? tenant.config?.orderPolicy?.missingQuantity ?? 'ask',
  }));
  useEffect(() => {
    setLlmDraft({
      phoneNumberId: tenant.config?.whatsapp?.phoneNumberId ?? '',
      phoneNumberIdRef: tenant.config?.whatsapp?.phoneNumberIdRef ?? `${tenant.id.toUpperCase()}_WHATSAPP_PHONE_NUMBER_ID_REF`,
      accessTokenRef: tenant.config?.whatsapp?.accessTokenRef ?? 'WHATSAPP_ACCESS_TOKEN_REF',
      verifyTokenRef: tenant.config?.whatsapp?.verifyTokenRef ?? 'WHATSAPP_WEBHOOK_VERIFY_TOKEN_REF',
      appSecretRef: tenant.config?.whatsapp?.appSecretRef ?? 'WHATSAPP_APP_SECRET_REF',
      tone: tenant.config?.agentPolicy?.tone ?? 'tendero_bogotano',
      humanEscalation: tenant.config?.agentPolicy?.humanEscalation ?? true,
      customerProfilesRange: tenant.config?.googleSheets?.customerProfilesRange ?? 'Clientes!A1:F500',
      ordersRange: tenant.config?.googleSheets?.ordersRange ?? 'Pedidos!A1:K500',
      missingQuantity: tenant.config?.agentPolicy?.missingQuantity ?? tenant.config?.orderPolicy?.missingQuantity ?? 'ask',
    });
  }, [tenant]);
  const fields = [
    ['Identificador WhatsApp', 'WHATSAPP_PHONE_NUMBER_ID_REF', MessageCircle],
    ['Token de verificación', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN_REF', KeyRound],
    ['Google Sheets', 'SPREADSHEET_ID_REF', Database],
    ['Google clientes', tenant.config?.googleSheets?.customerProfilesRange ?? 'Clientes!A1:F500', UserCheck],
    ['Google pedidos', tenant.config?.googleSheets?.ordersRange ?? 'Pedidos!A1:K500', ShoppingBag],
    ['Origen de secretos', 'Requiere revisión', Lock],
  ];
  return (
    <section className="config-layout">
      <div className="section-title">
        <span className="eyebrow">Configuración sin código</span>
        <h2>{tenant.name}</h2>
      </div>
      <div className="config-grid">
        <article className="settings-panel">
          <h3>Parámetros de la tienda</h3>
          {fields.map(([label, value, Icon]) => (
            <label className="config-field" key={label}>
              <span>
                <Icon size={16} />
                {label}
              </span>
              <input value={value} readOnly />
            </label>
          ))}
          <div className="isolation-note">
            <ShieldCheck size={18} />
            <span>Los secretos se guardan como referencias por cliente; la app no muestra valores planos.</span>
          </div>
        </article>
        <article className="settings-panel">
          <h3>WhatsApp por tienda</h3>
          <label className="config-field">
            <span>
              <MessageCircle size={16} />
              Identificador del número
            </span>
            <input value={llmDraft.phoneNumberId} onChange={(event) => setLlmDraft((current) => ({ ...current, phoneNumberId: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <KeyRound size={16} />
              Referencia del identificador
            </span>
            <input value={llmDraft.phoneNumberIdRef} onChange={(event) => setLlmDraft((current) => ({ ...current, phoneNumberIdRef: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <Lock size={16} />
              Referencia segura de acceso
            </span>
            <input value={llmDraft.accessTokenRef} onChange={(event) => setLlmDraft((current) => ({ ...current, accessTokenRef: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <ShieldCheck size={16} />
              Referencia de verificación
            </span>
            <input value={llmDraft.verifyTokenRef} onChange={(event) => setLlmDraft((current) => ({ ...current, verifyTokenRef: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <KeyRound size={16} />
              Referencia segura de aplicación
            </span>
            <input value={llmDraft.appSecretRef} onChange={(event) => setLlmDraft((current) => ({ ...current, appSecretRef: event.target.value }))} />
          </label>
          <button
            className="approve-btn"
            type="button"
            onClick={() => onSaveConfig({
              whatsapp: {
                phoneNumberId: llmDraft.phoneNumberId.trim(),
                phoneNumberIdRef: llmDraft.phoneNumberIdRef.trim(),
                accessTokenRef: llmDraft.accessTokenRef.trim(),
                verifyTokenRef: llmDraft.verifyTokenRef.trim(),
                appSecretRef: llmDraft.appSecretRef.trim(),
              },
            })}
          >
            <Check size={16} />
            Guardar WhatsApp
          </button>
        </article>
        <article className="settings-panel">
          <h3>Política del agente por tienda</h3>
          <label className="config-field">
            <span>
              <Bot size={16} />
              Tono comercial
            </span>
            <select value={llmDraft.tone} onChange={(event) => setLlmDraft((current) => ({ ...current, tone: event.target.value }))}>
              <option value="tendero_bogotano">Tendero bogotano</option>
              <option value="amable_directo">Amable y directo</option>
              <option value="formal_comercial">Formal comercial</option>
            </select>
          </label>
          <label className="config-field">
            <span>
              <MessageCircle size={16} />
              Cantidad omitida
            </span>
            <select value={llmDraft.missingQuantity} onChange={(event) => setLlmDraft((current) => ({ ...current, missingQuantity: event.target.value }))}>
              <option value="ask">Preguntar siempre</option>
              <option value="assume_one">Asumir 1 unidad</option>
            </select>
          </label>
          <label className="config-field">
            <span>
              <UserCheck size={16} />
              Escalamiento humano
            </span>
            <select value={llmDraft.humanEscalation ? 'enabled' : 'disabled'} onChange={(event) => setLlmDraft((current) => ({ ...current, humanEscalation: event.target.value === 'enabled' }))}>
              <option value="enabled">Escalar cuando falte información crítica</option>
              <option value="disabled">No escalar automáticamente</option>
            </select>
          </label>
          <label className="config-field">
            <span>
              <UserCheck size={16} />
              Hoja clientes
            </span>
            <input value={llmDraft.customerProfilesRange} onChange={(event) => setLlmDraft((current) => ({ ...current, customerProfilesRange: event.target.value }))} />
          </label>
          <label className="config-field">
            <span>
              <ShoppingBag size={16} />
              Hoja pedidos
            </span>
            <input value={llmDraft.ordersRange} onChange={(event) => setLlmDraft((current) => ({ ...current, ordersRange: event.target.value }))} />
          </label>
          <button
            className="approve-btn"
            type="button"
            onClick={() => onSaveConfig({
              agentPolicy: {
                tone: llmDraft.tone,
                missingQuantity: llmDraft.missingQuantity,
                humanEscalation: Boolean(llmDraft.humanEscalation),
                responseLanguage: 'es-CO',
              },
              googleSheets: {
                customerProfilesRange: llmDraft.customerProfilesRange,
                ordersRange: llmDraft.ordersRange,
              },
              orderPolicy: {
                missingQuantity: llmDraft.missingQuantity,
                customerIdentifier: 'whatsapp_wa_id',
                customerRequiredFields: ['name', 'defaultAddress'],
                customerProfileStore: 'google_sheets',
                confirmedOrderStore: 'google_sheets',
                confirmedOrderHandoff: 'preparation_and_delivery',
              },
            })}
          >
            <Check size={16} />
            Guardar política del agente
          </button>
          <div className="isolation-note">
            <Bot size={18} />
            <span>DeepSeek se administra globalmente en Centro de control; aquí solo se define cómo debe operar el agente para esta tienda.</span>
          </div>
        </article>
        <article className="tools-panel">
          <h3>Conexiones operativas</h3>
          <div className="tool-list">
            {toolList.map((tool) => (
              <div className="tool-row" key={tool.key}>
                <div>
                  <strong>{toolLabel(tool.name)}</strong>
                  <span>{tool.purpose}</span>
                  <code>{sourceLabel(tool.source)}</code>
                </div>
                <div className="tool-meta">
                  <StatusPill status={tool.status} />
                  <span className={`risk risk-${tool.risk}`}>{riskLabel(tool.risk)}</span>
                  {tool.sideEffects && <span className="side-effect">impacta datos</span>}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function Traceability({ events, conversations, compact = false }) {
  return (
    <section className={compact ? 'trace-layout compact-trace' : 'trace-layout'}>
      {!compact && (
        <div className="section-title">
          <span className="eyebrow">Trazabilidad operativa</span>
          <h2>Eventos, decisiones y herramientas</h2>
        </div>
      )}
      <div className="trace-grid">
        <article className="event-stream">
          {events.map((event) => (
            <div className="stream-row" key={event.id}>
              <time>{formatEventTime(event.at)}</time>
              <div>
                <strong>{eventTypeLabel(event.type)}</strong>
                <span>{event.detail}</span>
              </div>
              <code>{event.conversationId}</code>
            </div>
          ))}
        </article>
        <article className="audit-panel">
          <h3>Cobertura operativa</h3>
          {conversations.map((conversation) => (
            <div className="audit-row" key={conversation.id}>
              <span>{conversation.customer}</span>
              <StatusPill status={conversation.status} />
              <b>{conversation.progress}%</b>
            </div>
          ))}
          <div className="gap-card">
            <AlertTriangle size={18} />
            <div>
              <strong>Brecha detectada</strong>
              <span>Los contratos del ZIP no incluyen conexiones operativas ni secretos reales. La capa visual queda preparada para consumir eventos reales cuando existan endpoints.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default App;

