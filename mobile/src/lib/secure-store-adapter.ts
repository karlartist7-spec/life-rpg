import * as SecureStore from 'expo-secure-store'
const CHUNK = 1800
export const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key)
    if (head === null) return null
    if (!head.startsWith('__chunks__:')) return head
    const n = parseInt(head.split(':')[1], 10)
    let out = ''
    for (let i = 0; i < n; i++) out += (await SecureStore.getItemAsync(`${key}__${i}`)) ?? ''
    return out
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK) { await SecureStore.setItemAsync(key, value); return }
    const n = Math.ceil(value.length / CHUNK)
    await SecureStore.setItemAsync(key, `__chunks__:${n}`)
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK))
  },
  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key)
    if (head?.startsWith('__chunks__:')) {
      const n = parseInt(head.split(':')[1], 10)
      for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}__${i}`)
    }
    await SecureStore.deleteItemAsync(key)
  },
}
