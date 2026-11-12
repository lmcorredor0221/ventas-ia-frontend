import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Plus, Trash2, MessageCircle, ShoppingBag, RefreshCw, Check } from 'lucide-react';
import { getJson, patchJson } from '../../core/api/client.js';
import { orderStatusLabel } from '../../domain/orders/status.js';
import { normalizePaymentMethodId } from './orderWorkspaceValues.js';
import './OrderWorkspace.css';

const money = value => Number.isSafeInteger(value) ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value) : 'Por definir';
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const summaryStatus = {
  pending: 'Resumen actualizado en cola para WhatsApp.', processing: 'Enviando el resumen actualizado por WhatsApp.',
  retrying: 'No se pudo enviar el resumen todavía. Se reintentará; los cambios están guardados.',
  accepted: 'Meta aceptó el envío del resumen actualizado. Esto no confirma su lectura.',
  window_closed: 'El resumen no se envió: venció la ventana de atención de WhatsApp. Espera un mensaje del cliente para retomar el contacto.',
  failed: 'No se pudo enviar el resumen actualizado. Revisa la conexión de WhatsApp.',
  recipient_unavailable: 'No se envió el resumen: revisa la conversación asociada al pedido.',
  invalid_summary: 'No se envió el resumen: hay datos del pedido por revisar.',
  superseded: 'Esta notificación se omitió porque el pedido cambió de revisión o de etapa.',
};
const draftFor = order => ({ customerName: order.customerName ?? '', deliveryAddress: order.deliveryAddress ?? '',
  delivery: order.pricing?.delivery ?? order.delivery ?? true,
  deliveryFee: order.pricing?.deliveryFee ?? '', paymentMethod: normalizePaymentMethodId(order.paymentMethod),
  items: (order.items ?? []).map(item => ({ ...item })), minimumException: false, reason: '' });

export default function OrderWorkspace({ orderId, tenantId, headers, onClose, onSaved, onAdvance, onOpenWhatsApp }) {
  const dialog = useRef(null);
  const [context, setContext] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('order');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [conversationError, setConversationError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const alive = useRef(true);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    alive.current = true;
    dialog.current.showModal();
    return () => { alive.current = false; dialog.current?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    // Read the order/chat first. A failed catalog connection must not hide them.
    getJson(`/api/orders/${encodeURIComponent(orderId)}/workspace?catalog=false`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.order?.tenantId !== tenantId) throw new Error('Este pedido no pertenece a la tienda activa.');
        setContext(data); setDraft(draftFor(data.order)); setEditing(false); setConfirmed(false);
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId, tenantId, refresh]);
  useEffect(() => {
    if (!context?.conversation?.id) return;
    const controller = new AbortController();
    const update = async () => {
      try {
        const chat = await getJson(`/api/conversations/${encodeURIComponent(context.conversation.id)}`, { signal: controller.signal });
        if (!controller.signal.aborted && chat.tenantId === tenantId) { setContext(current => ({ ...current, conversation: chat })); setConversationError(''); }
      } catch (failure) { if (!controller.signal.aborted) setConversationError('No se pudo actualizar el chat. Conservamos los mensajes cargados.'); }
    };
    const timer = setInterval(update, 8000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [context?.conversation?.id, tenantId]);
  useEffect(() => {
    const lines = context?.order?.manualProductReview?.lines ?? [];
    setReviewDrafts(current => Object.fromEntries(lines.map(line => {
      const id = String(line.id ?? line.lineId);
      return [id, current[id] ?? {
        query: line.catalogQuery ?? line.rawName ?? '', products: [], nextCursor: null,
        selected: null, quantity: Number(line.requestedQuantity ?? 1), reason: '', searching: false, error: '',
      }];
    })));
  }, [context?.order?.version]);

  const close = () => { if (!busy) { if (editing) setDiscard(true); else onClose(); } };
  const change = patch => { setDraft(value => ({ ...value, ...patch })); setConfirmed(false); setNotice(''); };
  const startEdit = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await getJson(`/api/orders/${encodeURIComponent(orderId)}/workspace`, { timeoutMs: 30000 });
      if (!alive.current) return;
      if (data.order?.tenantId !== tenantId) throw new Error('La tienda activa cambió. Vuelve a abrir el pedido.');
      setContext(data); setDraft(draftFor(data.order)); setConfirmed(false); setQuery(''); setEditing(data.canEdit); setTab('order');
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const items = editing ? draft?.items ?? [] : context?.order?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + (item.saleMode === 'amount' ? Number(item.requestedAmount) : Number(item.quantity) * item.unitPrice), 0);
  const fee = editing ? draft?.delivery ? draft.deliveryFee === '' ? null : Number(draft.deliveryFee) : 0 : context?.order?.pricing?.deliveryFee;
  const total = Number.isSafeInteger(subtotal) && Number.isSafeInteger(fee) ? subtotal + fee : null;
  const minimum = context?.deliveryPolicy?.deliveryMinimumSubtotal;
  const belowMinimum = editing && draft.delivery && minimum != null && subtotal < minimum;
  const add = product => {
    const existing = items.find(item => item.sku === product.sku);
    if (existing) return;
    change({ items: [...items, { sku: product.sku, name: product.name, presentation: product.presentation,
      quantity: 1, unitPrice: product.price, saleMode: 'units', requestedAmount: null, allowsSaleByAmount: product.allowsSaleByAmount }] });
    setQuery('');
  };
  const updateLine = (index, patch) => change({ items: items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const save = async event => {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true); setError('');
    try {
      const result = await patchJson(`/api/orders/${encodeURIComponent(orderId)}`, {
        ...draft, items: draft.items.map(item => ({ sku: item.sku, quantity: item.saleMode === 'amount' ? null : Number(item.quantity),
          unitPrice: item.unitPrice, saleMode: item.saleMode ?? 'units', requestedAmount: item.saleMode === 'amount' ? Number(item.requestedAmount) : null })),
        expectedVersion: Number(context.order.version ?? 0), expectedTotal: total, deliveryFee: fee,
        customerConfirmed: confirmed,
      }, { headers, timeoutMs: 30000 });
      if (!alive.current) return;
      setContext(current => ({ ...current, order: result.order,
        summaryNotification: result.notification === 'queued' ? { status: 'pending', version: result.order.version } : null })); setDraft(draftFor(result.order));
      setEditing(false); setConfirmed(false); setNotice(`Cambios guardados. El pedido conserva su etapa.${result.notification === 'queued' ? '' : ' No se pudo programar el envío del resumen por WhatsApp.'}`);
      onSaved(result.order);
    } catch (failure) { if (alive.current) { setError(failure.message); setConfirmed(false); } }
    finally { if (alive.current) setBusy(false); }
  };
  const advance = async () => {
    setBusy(true); setError('');
    try {
      await onAdvance(context.order);
      if (alive.current) setRefresh(value => value + 1);
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const updateReviewDraft = (lineId, patch) => setReviewDrafts(current => ({
    ...current,
    [lineId]: { ...(current[lineId] ?? {}), ...patch },
  }));
  const searchReviewProducts = async (line, append = false) => {
    const lineId = String(line.id ?? line.lineId);
    const draft = reviewDrafts[lineId] ?? {};
    const search = String(draft.query ?? line.catalogQuery ?? line.rawName ?? '').trim();
    if (!search) return updateReviewDraft(lineId, { error: 'Escribe el producto que deseas buscar.' });
    updateReviewDraft(lineId, { searching: true, error: '' });
    try {
      const params = new URLSearchParams({ query: search, limit: '25' });
      if (append && draft.nextCursor) params.set('cursor', draft.nextCursor);
      const page = await getJson(`/api/tenants/${encodeURIComponent(tenantId)}/catalog/products?${params.toString()}`, { timeoutMs: 30000 });
      if (!alive.current) return;
      const products = append
        ? [...(draft.products ?? []), ...(page.products ?? [])].filter((product, index, all) => all.findIndex(item => item.sku === product.sku) === index)
        : page.products ?? [];
      updateReviewDraft(lineId, { products, nextCursor: page.catalog?.nextCursor ?? null, searching: false,
        error: products.length ? '' : 'No se encontraron coincidencias. Prueba con otra descripción o marca.' });
    } catch (failure) {
      if (alive.current) updateReviewDraft(lineId, { searching: false, error: failure.message });
    }
  };
  const resolveManualReview = async (line, outcome) => {
    const lineId = String(line.id ?? line.lineId);
    const draft = reviewDrafts[lineId] ?? {};
    if (outcome === 'found' && !draft.selected?.sku) {
      updateReviewDraft(lineId, { error: 'Selecciona primero la referencia encontrada en el catálogo.' });
      return;
    }
    setBusy(true); setError(''); setNotice(''); updateReviewDraft(lineId, { error: '' });
    try {
      const body = {
        expectedVersion: Number(context.order.version ?? 0),
        reason: String(draft.reason ?? '').trim() || undefined,
        ...(outcome === 'found' ? {
          sku: draft.selected.sku,
          ...(!line.budgetAmount && !line.requestedWeight ? { quantity: Number(draft.quantity ?? line.requestedQuantity ?? 1) } : {}),
        } : {}),
      };
      const result = await patchJson(`/api/orders/${encodeURIComponent(orderId)}/product-review/${encodeURIComponent(lineId)}/${outcome}`, body, { headers, timeoutMs: 30000 });
      if (!alive.current) return;
      setContext(current => ({ ...current, order: result.order,
        summaryNotification: result.notification === 'queued' ? { status: 'pending', version: result.order.version } : null }));
      setDraft(draftFor(result.order));
      setNotice(outcome === 'found'
        ? result.customerReconfirmationRequired
          ? 'Producto agregado. Enviamos el resumen actualizado y el pedido esperará la confirmación del cliente.'
          : 'Producto agregado al pedido.'
        : 'Producto marcado como no disponible. Informaremos al cliente y conservaremos el pedido parcial.');
      onSaved?.(result.order);
    } catch (failure) {
      if (alive.current) updateReviewDraft(lineId, { error: failure.message });
    } finally { if (alive.current) setBusy(false); }
  };
  const products = (context?.products ?? []).filter(product => normal(`${product.name} ${product.presentation} ${product.normalizedPresentation} ${product.description} ${product.brand} ${product.category} ${product.productFamily} ${JSON.stringify(product.attributes ?? {})} ${JSON.stringify(product.tags ?? [])} ${product.sku}`).includes(normal(query))).slice(0, 20);
  const order = context?.order;
  const reviewLines = order?.manualProductReview?.lines ?? [];
  const pendingReviewLines = reviewLines.filter(line => ['pending', 'awaiting_customer'].includes(line.status));
  const waitingCustomerConfirmation = order?.customerReconfirmation?.status === 'required';
  const reviewBlocksPreparation = pendingReviewLines.length > 0 || waitingCustomerConfirmation || order?.manualProductReview?.status === 'awaiting_customer_confirmation';
  return <dialog ref={dialog} className="order-workspace" aria-labelledby="order-workspace-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="ow-header"><div><span className="eyebrow">PEDIDO Y CONVERSACIÓN</span><h2 id="order-workspace-title">{order?.customerName || 'Revisar pedido'}</h2><span>{order ? `${orderStatusLabel(order.status)} · ${order.id}` : 'Cargando…'}</span></div>
      <button className="icon-btn" type="button" aria-label="Cerrar pedido" disabled={busy} onClick={close}><X size={20} /></button></header>
    <nav className="ow-tabs" aria-label="Vista del pedido"><button type="button" aria-pressed={tab === 'order'} onClick={() => setTab('order')}><ShoppingBag size={18} />Pedido</button><button type="button" aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={18} />Conversación</button></nav>
    {error && <div className="ow-notice is-error" role="alert">{error} <button className="text-btn" type="button" disabled={busy} onClick={() => editing ? setDiscard('reload') : setRefresh(value => value + 1)}>Recargar pedido</button></div>}
    {notice && <p className="ow-notice" role="status">{notice}</p>}
    {context?.summaryNotification && summaryStatus[context.summaryNotification.status] && <p className="ow-notice" role="status">{summaryStatus[context.summaryNotification.status]}</p>}
    {discard && <div className="ow-notice" role="alert"><p>Tienes una edición abierta. ¿Quieres descartar los cambios sin guardar?</p><button type="button" className="ghost-btn" onClick={() => setDiscard(false)}>Seguir editando</button><button type="button" className="deny-btn" onClick={() => { const reload = discard === 'reload'; setDiscard(false); if (reload) { setEditing(false); setRefresh(value => value + 1); } else onClose(); }}>Descartar cambios</button></div>}
    {loading ? <p className="ow-loading" role="status">Cargando pedido y conversación…</p> : context && <div className={`ow-columns ow-tab-${tab}`}>
      <section className="ow-order" aria-label="Detalle del pedido">
        <form onSubmit={save}>
          <div className="ow-section-heading"><h3>{editing ? 'Editar pedido' : 'Tu pedido'}</h3>{!editing && context.canEdit && <button className="ghost-btn" type="button" disabled={busy} onClick={startEdit}><Pencil size={16} />Editar pedido</button>}</div>
          {!context.canEdit && <p className="ow-muted">Este pedido ya está cerrado para edición. Puedes revisar lo acordado y su conversación.</p>}
          {!!reviewLines.length && <section className="ow-manual-review" aria-labelledby="ow-manual-review-title">
            <div className="ow-section-heading"><div><span className="eyebrow">REVISIÓN DE LA TIENDA</span><h3 id="ow-manual-review-title">Productos pendientes de búsqueda manual</h3></div><span className={`ow-review-state is-${order.manualProductReview?.status ?? 'pending'}`}>{pendingReviewLines.length ? `${pendingReviewLines.length} pendiente${pendingReviewLines.length === 1 ? '' : 's'}` : waitingCustomerConfirmation ? 'Esperando al cliente' : 'Revisión terminada'}</span></div>
            <p className="ow-muted">Resuelve cada solicitud antes de alistar. Si encuentras una referencia, VIA la agrega al mismo pedido, recalcula el total y pide al cliente confirmar el nuevo resumen.</p>
            <div className="ow-review-lines">{reviewLines.map(line => {
              const lineId = String(line.id ?? line.lineId);
              const review = reviewDrafts[lineId] ?? {};
              const pending = ['pending', 'awaiting_customer'].includes(line.status);
              return <article className={`ow-review-line is-${line.status ?? 'pending'}`} key={lineId}>
                <header><div><strong>{line.rawName ?? line.catalogQuery ?? 'Producto solicitado'}</strong><small>{line.requestedQuantity ? `${line.requestedQuantity} unidad${Number(line.requestedQuantity) === 1 ? '' : 'es'}` : line.budgetAmount ? `Presupuesto: ${money(Number(line.budgetAmount))}` : line.requestedWeight ? 'Venta por peso solicitada' : 'Cantidad por confirmar'}</small></div><span>{pending ? 'Por revisar' : line.status === 'found' ? 'Agregado' : 'No disponible'}</span></header>
                {pending ? <div className="ow-review-controls">
                  <label>Buscar en el catálogo<input type="search" value={review.query ?? ''} onChange={event => updateReviewDraft(lineId, { query: event.target.value, products: [], nextCursor: null, selected: null, error: '' })} placeholder="Producto, marca o descripción" /></label>
                  <button className="ghost-btn" type="button" disabled={busy || review.searching} onClick={() => searchReviewProducts(line)}>{review.searching ? 'Buscando…' : 'Buscar producto'}</button>
                  {!!review.products?.length && <ul className="ow-review-results" aria-label={`Resultados para ${line.rawName ?? line.catalogQuery}`}>{review.products.map(product => <li key={product.sku}><button type="button" className={review.selected?.sku === product.sku ? 'is-selected' : ''} disabled={busy || !(product.stock > 0 && product.price > 0)} onClick={() => updateReviewDraft(lineId, { selected: product, error: '' })}><span><strong>{product.name}</strong><small>{product.brand ? `${product.brand} · ` : ''}{product.presentation || 'Sin presentación'} · {money(product.price)} · {product.stock > 0 ? `${product.stock} disponibles` : 'Sin existencias'}</small></span><span>{review.selected?.sku === product.sku ? 'Seleccionado' : 'Elegir'}</span></button></li>)}</ul>}
                  {review.nextCursor && <button type="button" className="text-btn" disabled={busy || review.searching} onClick={() => searchReviewProducts(line, true)}>Cargar más resultados</button>}
                  {review.selected && <div className="ow-review-selected"><strong>{review.selected.name} {review.selected.presentation}</strong><span>{money(review.selected.price)}</span>
                    {!line.budgetAmount && !line.requestedWeight && <label>Cantidad<input type="number" min="1" max="999" step="1" value={review.quantity ?? 1} onChange={event => updateReviewDraft(lineId, { quantity: event.target.value === '' ? '' : Number(event.target.value), error: '' })} /></label>}
                    <label>Nota de la revisión (opcional)<input maxLength="300" value={review.reason ?? ''} onChange={event => updateReviewDraft(lineId, { reason: event.target.value })} placeholder="Ej. Encontramos esta referencia equivalente" /></label>
                  </div>}
                  {review.error && <p className="ow-review-error" role="alert">{review.error}</p>}
                  <div className="ow-review-actions"><button className="approve-btn" type="button" disabled={busy || !review.selected} onClick={() => resolveManualReview(line, 'found')}><Check size={17} />Agregar al pedido</button><button className="deny-btn" type="button" disabled={busy} onClick={() => resolveManualReview(line, 'unavailable')}>No está disponible</button></div>
                </div> : <p className="ow-review-resolution">{line.status === 'found' ? `${line.name ?? line.rawName} fue agregado al pedido.` : `${line.rawName ?? line.catalogQuery} no pudo incluirse.`}</p>}
              </article>;
            })}</div>
            {waitingCustomerConfirmation && <p className="ow-notice" role="status">El resumen actualizado ya fue enviado. El alistamiento se habilitará cuando el cliente confirme el ajuste desde WhatsApp.</p>}
          </section>}
          <fieldset disabled={busy}>
            <div className="ow-lines">{items.map((item, index) => <article className="ow-line" key={item.sku}>
              <div className="ow-product"><strong>{item.name || item.sku}</strong><span>{item.presentation}</span><small>{money(item.unitPrice)} por presentación</small></div>
              {editing ? <div className="ow-quantity"><label>{item.saleMode === 'amount' ? 'Valor solicitado (COP)' : 'Cantidad'}<input aria-label={`${item.saleMode === 'amount' ? 'Valor' : 'Cantidad'} de ${item.name}`} type="number" min="1" max={item.saleMode === 'amount' ? undefined : '999'} step="1" required value={item.saleMode === 'amount' ? item.requestedAmount ?? '' : item.quantity ?? ''} onChange={event => updateLine(index, item.saleMode === 'amount' ? { requestedAmount: event.target.value === '' ? '' : Number(event.target.value) } : { quantity: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
                <button type="button" className="text-btn" aria-label={`Quitar ${item.name}`} onClick={() => change({ items: items.filter((_, i) => i !== index) })}><Trash2 size={16} />Quitar</button></div> : <span className="ow-count">{item.saleMode === 'amount' ? 'Por valor' : `${item.quantity} ×`}</span>}
              <strong className="ow-line-total">{money(item.saleMode === 'amount' ? Number(item.requestedAmount) : Number(item.quantity) * item.unitPrice)}</strong>
            </article>)}</div>
            {editing && <div className="ow-search"><label>Agregar producto<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre, marca o presentación" /></label>
              {query.trim() && <ul aria-label="Productos encontrados">{products.map(product => <li key={product.sku}><button type="button" disabled={items.some(item => item.sku === product.sku) || !(product.stock > 0 && product.price > 0)} onClick={() => add(product)}><span><strong>{product.name}</strong> {product.presentation}<small>{money(product.price)} · {product.stock > 0 ? `${product.stock} disponibles` : 'Sin existencias'}</small></span><Plus size={18} /></button></li>)}{!products.length && <li>No hay coincidencias en el catálogo de esta tienda.</li>}</ul>}
            </div>}
            <div className="ow-customer">
              {editing ? <><label>Nombre del cliente<input required maxLength={160} value={draft.customerName} onChange={event => change({ customerName: event.target.value })} /></label>
                <label>Entrega<select aria-label="Entrega" value={draft.delivery ? 'delivery' : 'pickup'} onChange={event => change({ delivery: event.target.value === 'delivery' })}><option value="delivery">Domicilio</option><option value="pickup">Recoge en la tienda</option></select></label>
                {draft.delivery && <><label>Dirección<input required maxLength={500} value={draft.deliveryAddress} onChange={event => change({ deliveryAddress: event.target.value })} /></label><label>Costo del domicilio (COP)<input type="number" min="0" step="1" required value={draft.deliveryFee} onChange={event => change({ deliveryFee: event.target.value === '' ? '' : Number(event.target.value) })} /></label></>}
                <label>Medio de pago<select aria-label="Medio de pago" required value={draft.paymentMethod} onChange={event => change({ paymentMethod: event.target.value })}><option value="">Selecciona un medio</option>{context.paymentMethods.map(method => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label></> : <dl><div><dt>Entrega</dt><dd>{order.pricing?.delivery === false || order.delivery === false ? 'Recoge en la tienda' : order.deliveryAddress || 'Sin dirección registrada'}</dd></div><div><dt>Medio de pago</dt><dd>{order.paymentMethodLabel || context.paymentMethods.find(method => method.id === normalizePaymentMethodId(order.paymentMethod))?.label || order.paymentMethod || 'Sin registrar'}</dd></div></dl>}
            </div>
            <dl className="ow-totals"><div><dt>Productos</dt><dd>{money(subtotal)}</dd></div><div><dt>Domicilio</dt><dd>{money(fee)}</dd></div><div className="ow-grand-total"><dt>Total del pedido</dt><dd>{money(total)}</dd></div></dl>
            {editing && <><p className="ow-muted">Conservamos los precios acordados de los productos actuales. Los productos nuevos usan el precio del catálogo.</p>
              {belowMinimum && <div className="ow-notice"><p>El mínimo para domicilio de la tienda es {money(minimum)}.</p><label className="ow-checkbox"><input type="checkbox" checked={draft.minimumException} onChange={event => change({ minimumException: event.target.checked })} />Autorizo una excepción al mínimo para este pedido</label></div>}
              <label>Motivo o nota del cambio {belowMinimum ? '(obligatorio)' : '(opcional)'}<textarea maxLength={500} required={belowMinimum} value={draft.reason} onChange={event => change({ reason: event.target.value })} rows={2} /></label>
              <label className="ow-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />Acordé con el cliente los productos, la entrega, el medio de pago y este total.</label>
              <p className="ow-muted">Al guardar, se enviará al cliente el resumen actualizado por WhatsApp si la ventana de atención sigue abierta. Registrar el medio de pago no acredita su recepción.</p>
              <footer className="ow-actions"><button className="approve-btn" type="submit" disabled={!confirmed || !items.length || total == null || (belowMinimum && !draft.minimumException)}><Check size={18} />{busy ? 'Guardando…' : 'Guardar cambios'}</button><button className="ghost-btn" type="button" onClick={() => { setEditing(false); setDraft(draftFor(order)); setError(''); }}>Cancelar edición</button></footer></>}
          </fieldset>
          {!editing && <div className="ow-actions">{context.canEdit && onAdvance && <button className="approve-btn" type="button" disabled={busy || reviewBlocksPreparation} onClick={advance}>{busy ? 'Guardando…' : reviewBlocksPreparation ? pendingReviewLines.length ? 'Resuelve los productos pendientes' : 'Esperando confirmación del cliente' : order.status === 'preparing' ? 'Marcar en camino' : 'Marcar tomado'}</button>}<button className="text-btn" type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />Actualizar pedido</button></div>}
        </form>
        {!!order.editHistory?.length && <details className="ow-history"><summary>Historial de cambios ({order.editHistory.length})</summary>{[...order.editHistory].reverse().map(edit => <div key={edit.version}><strong>Revisión {edit.version} · {date(edit.at)}</strong><p>{money(edit.before?.pricing?.total ?? edit.before?.subtotal)} → {money(edit.after?.pricing?.total)}</p><p>{edit.reason || 'Cambios acordados con el cliente'}</p><ul>{edit.after?.items?.map(item => <li key={item.sku}>{item.saleMode === 'amount' ? money(item.requestedAmount) : `${item.quantity} ×`} {item.name}</li>)}</ul></div>)}</details>}
      </section>
      <section className="ow-chat" aria-label="Conversación del pedido"><div className="ow-section-heading"><h3>Conversación</h3>{onOpenWhatsApp && context.conversation && <button className="text-btn" type="button" onClick={() => onOpenWhatsApp(context.conversation)}>Abrir WhatsApp</button>}</div><p className="ow-muted">Mensajes del cliente y de la tienda. Se actualizan mientras revisas el pedido.</p>
        {conversationError && <p role="status">{conversationError}</p>}
        <div className="ow-messages">{!(context.conversation?.messages ?? []).length && <p>No hay mensajes guardados para este pedido.</p>}{(context.conversation?.messages ?? []).map((message, i) => <article key={message.id ?? i} className={`ow-message is-${message.role === 'user' ? 'customer' : message.role === 'system' ? 'system' : 'store'}`}><header><strong>{message.role === 'user' ? 'Cliente' : message.role === 'human' ? 'Tienda' : message.role === 'system' ? 'Actividad' : 'Asistente'}</strong><time>{date(message.createdAt)}</time></header><p>{message.text || `[${message.messageType ?? 'Adjunto'}]`}</p>{message.mediaRef && <span>Adjunto disponible en WhatsApp</span>}</article>)}</div>
      </section>
    </div>}
  </dialog>;
}
