import { describe, expect, it } from 'vitest';
import { collapseSpaces, findNamesake } from '../src/shared/names.js';

describe('collapseSpaces', () => {
  it('убирает пробелы по краям и схлопывает внутренние, включая табуляцию', () => {
    expect(collapseSpaces('  Анна \t  Тестова  ')).toBe('Анна Тестова');
  });
});

describe('findNamesake', () => {
  const employees = [
    { id: 1, name: 'Анна Тестова' },
    { id: 2, name: 'Пётр Образцов' },
  ];

  it.each(['Анна Тестова', 'анна тестова', '  Анна   Тестова ', 'АННА ТЕСТОВА'])('находит тёзку для «%s»', (name) => {
    expect(findNamesake(name, employees)).toBe(employees[0]);
  });

  it('«е» и «ё» считаются одной буквой', () => {
    expect(findNamesake('Петр Образцов', employees)).toBe(employees[1]);
  });

  it.each(['Анна Тест', 'Анна Тестова-Пробная', '', '   '])('нет тёзки для «%s»', (name) => {
    expect(findNamesake(name, employees)).toBeUndefined();
  });
});
