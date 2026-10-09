/**
 * The application menu's words. The menu is built in main, which has no
 * i18next; the renderer tells main its language (`app:uiLanguage`) and the
 * menu is rebuilt in it. Same two languages as the renderer's locales.
 */
export type UiLanguage = 'en' | 'es';

export const MENU_TEXT = {
  en: {
    file: 'File', newFloor: 'New Floor', openFloor: 'Open Floor', mainFloor: 'Main floor', noOffice: 'no office yet',
    running: 'open', noOtherFloors: 'No other floors yet', quit: 'Quit', close: 'Close',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'View', reload: 'Reload', forceReload: 'Force Reload', devTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullScreen: 'Toggle Full Screen',
    window: 'Window', minimize: 'Minimize', zoom: 'Zoom'
  },
  es: {
    file: 'Archivo', newFloor: 'Nueva planta', openFloor: 'Abrir planta', mainFloor: 'Planta principal', noOffice: 'sin oficina aún',
    running: 'abierta', noOtherFloors: 'Aún no hay otras plantas', quit: 'Salir', close: 'Cerrar',
    edit: 'Edición', undo: 'Deshacer', redo: 'Rehacer', cut: 'Cortar', copy: 'Copiar', paste: 'Pegar', selectAll: 'Seleccionar todo',
    view: 'Ver', reload: 'Recargar', forceReload: 'Forzar recarga', devTools: 'Herramientas de desarrollo',
    resetZoom: 'Tamaño real', zoomIn: 'Ampliar', zoomOut: 'Reducir', fullScreen: 'Pantalla completa',
    window: 'Ventana', minimize: 'Minimizar', zoom: 'Zoom'
  }
} as const satisfies Record<UiLanguage, Record<string, string>>;

export function menuText(lang: unknown): (typeof MENU_TEXT)[UiLanguage] {
  return lang === 'es' ? MENU_TEXT.es : MENU_TEXT.en;
}
