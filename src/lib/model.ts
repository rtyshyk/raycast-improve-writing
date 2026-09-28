import { getPreferenceValues, LocalStorage } from "@raycast/api";

const STORAGE_KEY = "activeModel";

export async function getActiveModel() {
  return (await LocalStorage.getItem<string>(STORAGE_KEY)) || getPreferenceValues<Preferences>().defaultModel.trim();
}

export const setActiveModel = (id: string) => LocalStorage.setItem(STORAGE_KEY, id);

export const resetActiveModel = () => LocalStorage.removeItem(STORAGE_KEY);
