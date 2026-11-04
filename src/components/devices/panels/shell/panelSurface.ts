import React from 'react';

/** What holds a panel. Whoever opens one says it here: the panel looks as what holds it. */
export type PanelSurface = 'sheet' | 'column' | 'dialog';

export const PanelSurfaceContext = React.createContext<PanelSurface | null>(null);
