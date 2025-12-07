import { moment } from 'obsidian';
import en from '../lang/en.json';
import zh from '../lang/zh.json';

const translations: Record<string, Record<string, string>> = {
    en,
    zh,
};

const locale = moment.locale();

function getTranslation() {
    // 优先完全匹配
    if (translations[locale]) {
        return translations[locale];
    }
    // 处理 'zh-cn' 'zh-tw' 等情况
    if (locale.startsWith('zh')) {
        return translations['zh'];
    }
    // 默认返回英文
    return translations['en'];
}

const lang = getTranslation();

export function t(key: string): string {
    return lang[key] || translations['en'][key] || key;
}
