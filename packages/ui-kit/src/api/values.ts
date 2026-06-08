import type { PiperApiClient } from '../client'

export interface ValueItem {
  name: string
  value: string
}

export const VALUES_URL = 'api/values'

export const fetchValues = (client: PiperApiClient): Promise<ValueItem[]> =>
  client.get<ValueItem[]>(VALUES_URL)
