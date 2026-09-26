import { createContext } from 'react'

// Image gestures ask their host to expand, including through a portal.
export const ImageViewContext = createContext<(() => void) | null>(null)
