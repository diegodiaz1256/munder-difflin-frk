import { useEffect, useRef } from 'react';
import { Application, Container, Texture, type Ticker } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { TiledMapRenderer } from './TiledMapRenderer';
import { Camera } from './Camera';
import { Character } from './Character';
import { MessageEnvelope } from './MessageEnvelope';
import { colors } from '@/design/tokens';
import { loadTheme, resolveThemeMap, themeTilesetUrls } from './themeLoader';
import type { OfficeCharacterName } from './cast';
import type { Tile } from './themeRegistry';
import type { FactoryAgentView, FactoryEventView, FactoryFloorView } from '../../../../preload/index';

/**
 * A factory's floor in pixel art (Manager → Factories): the same office map
 * and cast as our own floor, peopled by the factory's workers instead of our
 * agents. It only draws what the factory reports (FACTORY-MCP.md):
 *
 *   working  → at the desk, typing          idle    → at the desk
 *   waiting  → at the desk, a thought cloud  resting → off to the break area
 *   away     → off to the meeting room       offline → not on the floor
 *
 * A task changing hands (event task.handoff) flies a sheet of paper from one
 * desk to the next; red when work is sent back. Workers outside the projects
 * picked in the filter are dimmed.
 */

const CAST: OfficeCharacterName[] = ['pam', 'jim', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith', 'michael'];
const ROLE_ORDER = ['planner', 'orderer', 'builder', 'reviewer', 'qa', 'automation'];
const ROLE_GLOW: Record<string, number> = {
  planner: colors.accent.lilac, orderer: colors.accent.sky, builder: colors.accent.mint,
  reviewer: colors.accent.peach, qa: colors.accent.lemon, automation: colors.ink[300]
};

export function faceFor(name: string): OfficeCharacterName {
  let h = 0;
  for (const c of name.replace(/\s+\d+$/, '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CAST[h % CAST.length];
}

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const t = Texture.from(img); t.source.scaleMode = 'nearest'; resolve(t); };
    img.onerror = reject;
    img.src = url;
  });
}

interface Runtime { character: Character; seat: Tile; state?: string; taskId?: string }

interface SceneApi {
  sync: (floor: FactoryFloorView, dimmed: Set<string>) => void;
  events: (evs: FactoryEventView[]) => void;
}

export function FactoryScene({ floor, events, dimmed, onPick }: {
  floor: FactoryFloorView;
  /** New events since the last render (hand-offs are animated). */
  events: FactoryEventView[];
  /** Agent ids to dim (outside the project filter). */
  dimmed: Set<string>;
  onPick: (agentId: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const pending = useRef<{ floor: FactoryFloorView; dimmed: Set<string> } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    const app = new Application();
    const runtimes = new Map<string, Runtime>();
    const envelopes: MessageEnvelope[] = [];

    void (async () => {
      const theme = await loadTheme('office');
      await app.init({
        // The page's paper, so the letterbox around the map reads as part of it.
        background: colors.cream[200], antialias: false, roundPixels: true,
        resolution: Math.max(window.devicePixelRatio || 1, 2), autoDensity: true,
        width: el.clientWidth || 800, height: el.clientHeight || 420
      });
      if (!alive) { app.destroy(true, { children: true }); return; }
      el.appendChild(app.canvas);
      const textures = await Promise.all(themeTilesetUrls(theme).map(loadTexture));
      if (!alive) return;
      const world = new Container();
      app.stage.addChild(world);
      const map = new TiledMapRenderer(resolveThemeMap(theme), textures);
      world.addChild(map.getContainer());
      const layer = map.getCharacterContainer();
      const camera = new Camera(world);
      camera.setMapSize(map.width * map.tileSize, map.height * map.tileSize);
      camera.setViewSize(app.screen.width, app.screen.height);
      camera.fitToScreen();

      // Seats: the map's desks, then the meeting room as overflow.
      const seats: Tile[] = [];
      const seen = new Set<string>();
      const add = (t?: Tile) => { if (!t) return; const k = `${t.x},${t.y}`; if (!seen.has(k)) { seen.add(k); seats.push({ x: t.x, y: t.y }); } };
      for (const n of theme.primarySeatNames) add(map.getSpawnPoint(n));
      const meeting: Tile[] = [];
      const room = map.getZone('boardroom');
      if (room) for (let y = room.y; y < room.y + room.height; y++) for (let x = room.x; x < room.x + room.width; x++) if (map.isWalkable(x, y)) { add({ x, y }); meeting.push({ x, y }); }
      const breakSpots: Tile[] = theme.cafeSeatNames.map((n) => map.getSpawnPoint(n)).filter((p): p is Tile => !!p);
      const entrance = map.getSpawnPoint('entrance') ?? { x: Math.floor(map.width / 2), y: map.height - 2 };
      const facing = (t: Tile) => (!map.isWalkable(t.x, t.y - 1) ? 'up' : !map.isWalkable(t.x, t.y + 1) ? 'down' : !map.isWalkable(t.x - 1, t.y) ? 'left' : !map.isWalkable(t.x + 1, t.y) ? 'right' : 'up') as 'up' | 'down' | 'left' | 'right';
      const taken = new Set<number>();
      const feet = (c: Character) => { const p = c.getTilePosition(); return { x: p.x * map.tileSize + map.tileSize / 2, y: p.y * map.tileSize + map.tileSize }; };

      const place = (a: FactoryAgentView, rt: Runtime) => {
        const c = rt.character;
        if (rt.state === a.state && rt.taskId === a.task?.id) return;
        const first = rt.state === undefined;
        rt.state = a.state;
        const newTask = a.task?.id !== rt.taskId;
        rt.taskId = a.task?.id;
        c.hideThought();
        c.setStatusGlyph(a.state === 'waiting' ? 'blocked' : 'none');
        if (a.state === 'resting' && breakSpots.length) {
          c.walkToAndThen(breakSpots[seatIndexOf(rt) % breakSpots.length], () => c.setIdle());
          c.showThought(a.waiting_for ? `on a break: ${a.waiting_for}` : 'on a break');
          return;
        }
        if (a.state === 'away' && meeting.length) {
          c.walkToAndThen(meeting[seatIndexOf(rt) % meeting.length], () => c.setIdle());
          if (a.at) c.showThought(`at the ${a.at.replace('_', ' ')}`);
          return;
        }
        const sit = () => c.sitAtDesk(a.state === 'working');
        if (first) sit(); else c.walkToAndThen(rt.seat, sit);
        if (a.state === 'waiting') c.showThought(a.waiting_for ? `waiting ${a.waiting_for}` : 'waiting');
        else if (a.state === 'working' && a.task && newTask) c.showThought(`${a.task.title}${a.task.stage ? ` · ${a.task.stage}` : ''}`);
      };
      const seatIndexOf = (rt: Runtime) => Math.max(0, seats.findIndex((s) => s.x === rt.seat.x && s.y === rt.seat.y));

      const sync = (floor: FactoryFloorView, dimmed: Set<string>) => {
        // Seat by role so a stage of the line sits together; instances next to their base.
        const ordered = [...floor.agents].sort((x, y) =>
          (ROLE_ORDER.indexOf(x.role_kind ?? '') + 1 || 99) - (ROLE_ORDER.indexOf(y.role_kind ?? '') + 1 || 99)
          || (x.instance_of ?? x.name).localeCompare(y.instance_of ?? y.name) || x.name.localeCompare(y.name));
        for (const a of ordered) {
          let rt = runtimes.get(a.id);
          if (a.state === 'offline') {
            if (rt) { rt.character.hide(0); runtimes.delete(a.id); const i = seatIndexOf(rt); taken.delete(i); setTimeout(() => rt!.character.destroy(), 700); }
            continue;
          }
          if (!rt) {
            const i = seats.findIndex((_, k) => !taken.has(k));
            if (i < 0) continue; // no desk left
            taken.add(i);
            const seat = seats[i];
            const id = a.id;
            rt = { character: null as unknown as Character, seat };
            runtimes.set(id, rt);
            const r = rt;
            void theme.cast.getFrames(faceFor(a.name)).then((frames) => {
              if (!alive || runtimes.get(id) !== r) return;
              r.character = new Character({
                agentId: id, displayName: a.display_name ?? a.name, mapRenderer: map, frames,
                seatTile: seat, seatDirection: facing(seat), spawnTile: entrance,
                glowColor: ROLE_GLOW[a.role_kind ?? ''] ?? colors.ink[300],
                onClick: (aid) => pick.current(aid)
              });
              r.character.show(layer);
              const latest = pending.current?.floor.agents.find((x) => x.id === id) ?? a;
              place(latest, r);
              r.character.setBaseAlpha(pending.current?.dimmed.has(id) ? 0.35 : 1);
            });
            continue;
          }
          if (!rt.character) continue; // still loading its sprite
          rt.character.setBaseAlpha(dimmed.has(a.id) ? 0.35 : 1);
          place(a, rt);
        }
      };

      const onEvents = (evs: FactoryEventView[]) => {
        const byName = (n?: string) => [...runtimes.values()].find((r) => r.character && pending.current?.floor.agents.find((a) => a.id === r.character.agentId)?.name === n);
        for (const e of evs) {
          if (e.type === 'task.handoff') {
            const from = byName(e.from); const to = byName(e.to);
            if (!from?.character || !to?.character) continue;
            const env = new MessageEnvelope(feet(from.character), feet(to.character), e.ok === false ? 'refuse' : 'done', false);
            world.addChild(env.container);
            envelopes.push(env);
            if (e.ok === false && e.text) from.character.showThought(`sent back: ${e.text}`);
          } else if (e.type === 'task.done' || e.type === 'deploy') {
            const who = pending.current?.floor.agents.find((a) => a.task?.id === e.task);
            const rt = who ? runtimes.get(who.id) : undefined;
            rt?.character?.cheer();
          }
        }
        while (envelopes.length > 16) envelopes.shift()?.destroy();
      };

      app.ticker.add((ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000;
        camera.update(dt);
        const zoom = world.scale.x;
        for (const rt of runtimes.values()) { if (!rt.character) continue; rt.character.setBubbleZoom(zoom); rt.character.update(dt); }
        for (let i = envelopes.length - 1; i >= 0; i--) if (envelopes[i].update(dt)) { envelopes[i].destroy(); envelopes.splice(i, 1); }
      });
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const { width, height } = e.contentRect;
          if (!width || !height) continue;
          app.renderer?.resize(width, height);
          camera.setViewSize(width, height);
          camera.fitToScreen();
        }
      });
      ro.observe(el);
      (app as unknown as { __ro: ResizeObserver }).__ro = ro;

      api.current = { sync, events: onEvents };
      if (pending.current) sync(pending.current.floor, pending.current.dimmed);
    })();

    return () => {
      alive = false;
      api.current = null;
      try { (app as unknown as { __ro?: ResizeObserver }).__ro?.disconnect(); } catch { /* noop */ }
      for (const rt of runtimes.values()) { try { rt.character?.destroy(); } catch { /* noop */ } }
      try { app.ticker?.stop(); app.destroy(true, { children: true }); } catch { /* noop */ }
    };
  }, []);

  useEffect(() => {
    pending.current = { floor, dimmed };
    api.current?.sync(floor, dimmed);
  }, [floor, dimmed]);

  useEffect(() => {
    if (events.length) api.current?.events(events);
  }, [events]);

  return <div ref={host} style={{ width: '100%', height: 'min(62vh, 560px)', minHeight: 360, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--cth-cream-200)' }} />;
}
