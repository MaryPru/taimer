// Сравнение имён сотрудников. Тёзки в компании бывают, поэтому совпадение не запрещаем,
// а предупреждаем о нём в форме добавления.

/** Пробелы по краям убраны, внутренние схлопнуты в один: «Анна   Тестова» и «Анна Тестова» одно имя. */
export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Ключ для сравнения: без учёта регистра, «ё» считается за «е». */
export function nameKey(name: string): string {
  return collapseSpaces(name).toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

/** Уже добавленный сотрудник с тем же именем или undefined. */
export function findNamesake<T extends { name: string }>(name: string, employees: readonly T[]): T | undefined {
  const key = nameKey(name);
  return employees.find((employee) => nameKey(employee.name) === key);
}
