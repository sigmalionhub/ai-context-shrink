/**
 * ai-context-shrink
 * Утилита для сжатия объектов и текста с целью минимизации токенов при сохранении
 * максимальной понятности для LLM.
 *
 * @module ai-context-shrink
 */
/**
 * Настройки алгоритма сжатия.
 */
export interface ShrinkOptions {
    /**
     * Максимальное количество элементов, оставляемых с начала и с конца массива.
     * Итого в массиве останется не более maxArrayItems * 2 элементов.
     * @default 3
     */
    maxArrayItems?: number;
    /**
     * Максимальная длина строковых значений (в символах) перед обрезкой.
     * @default 100
     */
    maxStringLength?: number;
    /**
     * Режим схемы: вместо значений выводить только типы ключей.
     * Полезно, когда важна структура данных, а не сами значения.
     * @default false
     */
    schemaMode?: boolean;
    /**
     * Максимальная глубина рекурсии для вложенных объектов.
     * Объекты глубже этого уровня заменяются на "[Object]" / "[Array]".
     * @default 10
     */
    maxDepth?: number;
    /**
     * Строка-заполнитель для циклических ссылок.
     * @default "[Circular]"
     */
    circularPlaceholder?: string;
}
/**
 * Дефолтные настройки — применяются, если параметр не передан явно.
 */
declare const DEFAULT_OPTIONS: Required<ShrinkOptions>;
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
export declare function shrink(data: unknown, options?: ShrinkOptions): unknown;
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
export declare function shrinkToString(data: unknown, options?: ShrinkOptions, space?: string | number): string;
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
export declare function schema(data: unknown, options?: Omit<ShrinkOptions, "schemaMode">): unknown;
export { DEFAULT_OPTIONS };
//# sourceMappingURL=index.d.ts.map