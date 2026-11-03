import type { KeyboardEvent, ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

interface Props<T extends string> {
  /** Название группы вкладок для экранного диктора. */
  label: string;
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
}

export const tabId = (id: string) => `tab-${id}`;
export const panelId = (id: string) => `panel-${id}`;

/**
 * Вкладки по образцу WAI-ARIA: в порядке обхода по Tab только выбранная вкладка,
 * стрелки влево и вправо переключают вкладку вместе с фокусом, Home и End ведут к крайним.
 * Панели рисует вызывающий код: id = panelId(id), role="tabpanel", hidden у невыбранных.
 */
export function Tabs<T extends string>({ label, tabs, selected, onSelect }: Props<T>) {
  function handleKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    if (!tab) return;
    onSelect(tab.id);
    document.getElementById(tabId(tab.id))?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const isSelected = tab.id === selected;
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            className="tab"
            aria-selected={isSelected}
            aria-controls={panelId(tab.id)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
