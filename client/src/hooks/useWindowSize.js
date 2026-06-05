import { useState, useEffect } from 'react'

export function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    function handleResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    width,
    isMobile:  width < 768,
    isTablet:  width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  }
}
