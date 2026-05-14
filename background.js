chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url.includes('articles.zsxq.com')) {
    chrome.notifications.create({ type: 'basic', title: '提示', message: '请在知识星球文章页面使用' });
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    chrome.downloads.download({ url: request.url, filename: request.filename, saveAs: false });
  }
});