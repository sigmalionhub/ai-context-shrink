/**
 * ai-context-shrink
 * Утилита для сжатия объектов и текста с целью минимизации токенов при сохранении
 * максимальной понятности для LLM.
 *
 * @module ai-context-shrink
 */
/**
 * Дефолтные настройки — применяются, если параметр не передан явно.
 */
const DEFAULT_OPTIONS = {
    maxArrayItems: 3,
    maxStringLength: 100,
    schemaMode: false,
    maxDepth: 10,
    circularPlaceholder: "[Circular]",
};
// ─── Вспомогательные функции ──────────────────────────────────────────────────
/**
 * Определяет «человекочитаемый» тип значения для Schema Mode.
 * Отличает null, array и object друг от друга — в отличие от typeof.
 */
function getTypeName(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "array";
    return typeof value; // "string" | "number" | "boolean" | "object" | "undefined" | "function" | "symbol" | "bigint"
}
/**
 * Обрезает строку до maxLength символов, добавляя "..." если она длиннее.
 */
function trimString(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength) + "...";
}
/**
 * Применяет Smart Array Truncation:
 * оставляет первые N и последние N элементов, заменяя середину маркером.
 *
 * Пример: [1,2,3,4,5,6,7] при N=2 → [1, 2, "[+ 3 items]", 6, 7]
 */
function truncateArray(arr, maxItems) {
    // Если элементов достаточно мало — возвращаем как есть
    const threshold = maxItems * 2;
    if (arr.length <= threshold)
        return arr;
    const skipped = arr.length - threshold;
    return [
        ...arr.slice(0, maxItems),
        `[+ ${skipped} items]`,
        ...arr.slice(arr.length - maxItems),
    ];
}
// ─── Основная рекурсивная функция ─────────────────────────────────────────────
/**
 * Внутренняя рекурсивная функция обхода данных.
 *
 * @param data     - Текущее значение для обработки
 * @param opts     - Нормализованные (с дефолтами) параметры
 * @param seen     - WeakSet для отслеживания уже посещённых объектов (защита от цикличных ссылок)
 * @param depth    - Текущая глубина рекурсии
 */
function processValue(data, opts, seen, depth) {
    // ── Примитивы ──────────────────────────────────────────────────────────────
    if (data === null || data === undefined) {
        return opts.schemaMode ? "null" : data;
    }
    if (typeof data === "boolean" || typeof data === "number") {
        return opts.schemaMode ? typeof data : data;
    }
    if (typeof data === "bigint") {
        return opts.schemaMode ? "bigint" : data.toString();
    }
    if (typeof data === "symbol") {
        return opts.schemaMode ? "symbol" : data.toString();
    }
    if (typeof data === "function") {
        // Функции не несут смысловой нагрузки для LLM — заменяем
        return opts.schemaMode ? "function" : "[Function]";
    }
    // ── Строки ────────────────────────────────────────────────────────────────
    if (typeof data === "string") {
        if (opts.schemaMode)
            return "string";
        return trimString(data, opts.maxStringLength);
    }
    // ── Объекты и массивы (передаются по ссылке — нужна защита от циклов) ─────
    if (typeof data === "object") {
        // Защита от циклических ссылок
        if (seen.has(data)) {
            return opts.circularPlaceholder;
        }
        seen.add(data);
        // Проверка глубины рекурсии
        if (depth >= opts.maxDepth) {
            seen.delete(data);
            return Array.isArray(data) ? "[Array]" : "[Object]";
        }
        let result;
        if (Array.isArray(data)) {
            result = processArray(data, opts, seen, depth);
        }
        else {
            result = processObject(data, opts, seen, depth);
        }
        // После обработки удаляем из seen, чтобы один объект мог встречаться
        // в разных ветках дерева (но не в одной цепочке)
        seen.delete(data);
        return result;
    }
    // Всё остальное (на случай экзотических значений) — приводим к строке
    return String(data);
}
/**
 * Обрабатывает массив: применяет усечение, затем рекурсивно обрабатывает элементы.
 */
function processArray(arr, opts, seen, depth) {
    // Сначала усекаем массив, чтобы не тратить время на обработку «выброшенных» элементов
    const truncated = truncateArray(arr, opts.maxArrayItems);
    return truncated.map((item) => {
        // Маркер усечения — строка, не трогаем
        if (typeof item === "string" && item.startsWith("[+ ") && item.endsWith(" items]")) {
            return item;
        }
        return processValue(item, opts, seen, depth + 1);
    });
}
/**
 * Обрабатывает объект: в Schema Mode возвращает карту key→type,
 * в обычном режиме рекурсивно обрабатывает значения.
 */
function processObject(obj, opts, seen, depth) {
    const result = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (opts.schemaMode) {
            // В режиме схемы для объектов и массивов рекурсивно строим структуру
            if (value !== null && typeof value === "object") {
                result[key] = processValue(value, opts, seen, depth + 1);
            }
            else {
                result[key] = getTypeName(value);
            }
        }
        else {
            result[key] = processValue(value, opts, seen, depth + 1);
        }
    }
    return result;
}
// ─── Публичный API ────────────────────────────────────────────────────────────
/**
 * Сжимает произвольные данные для передачи в LLM с минимальным количеством токенов.
 *
 * Алгоритм работает за один проход O(n), где n — общее количество узлов в дереве данных.
 *
 * @param data    - Входные данные: объект, массив, строка или примитив
 * @param options - Параметры сжатия (все необязательны, есть дефолты)
 * @returns Сжатая копия данных (исходные данные не мутируются)
 *
 * @example
 * ```ts
 * import { shrink } from 'ai-context-shrink';
 *
 * const result = shrink({ name: 'Alice', tags: [1,2,3,4,5,6,7,8] });
 * // { name: 'Alice', tags: [1, 2, 3, '[+ 2 items]', 7, 8] }
 * ```
 */
export function shrink(data, options = {}) {
    // Нормализуем опции: дефолты + переданные значения
    const opts = {
        ...DEFAULT_OPTIONS,
        ...options,
    };
    // WeakSet хранит только объекты (не примитивы) — это именно то, что нужно
    const seen = new WeakSet();
    return processValue(data, opts, seen, 0);
}
/**
 * Вспомогательная функция: сжимает данные и сразу сериализует в строку JSON.
 * Удобна для прямой передачи в промпт.
 *
 * @param data    - Входные данные
 * @param options - Параметры сжатия
 * @param space   - Отступ для JSON.stringify (опционально, для читаемости)
 * @returns Строка JSON со сжатыми данными
 *
 * @example
 * ```ts
 * const prompt = `Here is the context:\n${shrinkToString(myData)}`;
 * ```
 */
export function shrinkToString(data, options = {}, space) {
    return JSON.stringify(shrink(data, options), null, space);
}
/**
 * Вспомогательная функция: возвращает только схему (структуру) данных.
 * Эквивалентно вызову `shrink(data, { schemaMode: true })`.
 *
 * @param data    - Входные данные
 * @param options - Дополнительные параметры (schemaMode будет принудительно true)
 * @returns Схема данных: дерево объектов с именами типов вместо значений
 *
 * @example
 * ```ts
 * schema({ id: 1, name: 'Bob', active: true });
 * // { id: 'number', name: 'string', active: 'boolean' }
 * ```
 */
export function schema(data, options = {}) {
    return shrink(data, { ...options, schemaMode: true });
}
// Экспорт дефолтных настроек — полезен для пользователей, желающих их расширить
export { DEFAULT_OPTIONS };
//# sourceMappingURL=index.js.map