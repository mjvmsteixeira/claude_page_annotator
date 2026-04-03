/* Background service worker — handles keyboard shortcut */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-annotator') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  } catch {
    // Content script not yet injected — inject and retry
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['i18n.js'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    } catch {
      // Restricted page (chrome://, new tab, etc.) — ignore
    }
  }
});
