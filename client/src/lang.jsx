import { createContext, useContext, useState } from 'react'
import { translations } from './translations.js'

const LangContext = createContext({ lang: 'sr', setLang: () => {} })

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('jt_lang') || 'sr')

  function changeLang(l) {
    localStorage.setItem('jt_lang', l)
    setLang(l)
  }

  return <LangContext.Provider value={{ lang, setLang: changeLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

export function useT() {
  const { lang } = useContext(LangContext)
  return function t(key, vars = {}) {
    const str = translations[lang]?.[key] ?? translations.sr[key] ?? key
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), str)
  }
}
