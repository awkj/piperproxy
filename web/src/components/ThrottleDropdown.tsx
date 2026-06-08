import useSWR from 'swr'
import { ThrottleDropdown as ThrottleDropdownUI } from '@piper/ui-kit'
import { THROTTLE_URL, fetchThrottle, setThrottle, type ThrottleConfig } from '@/api/throttle'

export function ThrottleDropdown() {
  const { data, mutate } = useSWR(THROTTLE_URL, fetchThrottle)
  return (
    <ThrottleDropdownUI
      config={data}
      onSetThrottle={(cfg) =>
        mutate(setThrottle(cfg as ThrottleConfig), { optimisticData: cfg as ThrottleConfig })
      }
    />
  )
}
