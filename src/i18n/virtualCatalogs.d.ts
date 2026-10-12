type DomusTranslationCatalog = Readonly<Record<import('./translations').TranslationKey, string>>;

declare module 'virtual:domus-i18n/it' {
  const catalog: DomusTranslationCatalog;
  export default catalog;
}

declare module 'virtual:domus-i18n/en' {
  const catalog: DomusTranslationCatalog;
  export default catalog;
}

declare module 'virtual:domus-i18n/fr' {
  const catalog: DomusTranslationCatalog;
  export default catalog;
}
