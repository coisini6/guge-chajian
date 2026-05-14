(function() {
  'use strict';

  /** 精确提取文章内容（Quill 专用稳定版） */
  function extractContentToMarkdown(root) {
    const parts = [];

    /** 检测代码块容器（Quill 特性） */
    function isCodeBlockContainer(node) {
      return node.nodeType === 1 && 
             node.classList && 
             node.classList.contains('ql-code-block-container');
    }

    /** 检测 IMG */
    function isImageNode(node) {
      return node.nodeType === 1 && node.tagName === 'IMG';
    }

    /** 获取列表深度 */
    function getListDepth(li) {
      let depth = 0, parent = li;
      while (parent) {
        if (parent.tagName === 'UL' || parent.tagName === 'OL') depth++;
        parent = parent.parentElement;
      }
      return depth;
    }

    function walk(node) {
      if (!node) return;

      // 🛡️ 优先强制处理 IMG（确保永不丢失）
      if (isImageNode(node)) {
        const src = node.src;
        if (src && src.startsWith('data:')) {
          parts.push(`![${node.alt || 'image'}](${src})\n\n`);
        }
        return; // IMG 无子节点
      }

      // 处理代码块容器（关键修复！）
      if (isCodeBlockContainer(node)) {
        console.log('📦 发现代码块容器，开始提取...');
        
        // 收集所有代码行
        const codeLines = [];
        const lineElements = node.querySelectorAll('.ql-code-block');
        
        lineElements.forEach(lineEl => {
          // 1. 获取原始 HTML（保留 <br>）
          let html = lineEl.innerHTML;
          
          // 2. 替换 <br> 为换行符
          html = html.replace(/<br\s*\/?>/gi, '\n');
          
          // 3. 解码 HTML 实体（&nbsp; 等）
          const txt = document.createElement('textarea');
          txt.innerHTML = html;
          let text = txt.value;
          
          // 4. 移除剩余 HTML 标签
          text = text.replace(/<\/?[^>]+(>|$)/g, '');
          
          // 5. 规范化空白字符
          text = text.trimEnd(); // 保留行内空格，移除行尾空格
          
          codeLines.push(text);
        });
        
        // 合并成 Markdown 代码块
        if (codeLines.length > 0) {
          parts.push(`\n\n\`\`\`yaml\n${codeLines.join('\n')}\n\`\`\`\n\n`);
          console.log(`✅ 已提取代码块 (${codeLines.length} 行)`);
        }
        
        return; // 不递归容器的孙节点
      }

      // 处理其他块级元素（只提取文本，继续递归）
      if (node.nodeType === 1) {
        const tag = node.tagName;
        
        switch(tag) {
          case 'H1': parts.push(`# ${node.innerText.trim()}\n\n`); break;
          case 'H2': parts.push(`## ${node.innerText.trim()}\n\n`); break;
          case 'H3': case 'H4': parts.push(`### ${node.innerText.trim()}\n\n`); break;
          case 'P': parts.push(`${node.innerText.trim()}\n\n`); break;
          case 'LI':
            const depth = getListDepth(node);
            const indent = '  '.repeat(Math.max(0, depth - 1));
            parts.push(`${indent}- ${node.innerText.trim().replace(/\n/g, ' ')}\n`);
            break;
          case 'BLOCKQUOTE':
            parts.push(`> ${node.innerText.trim().replace(/\n/g, '\n> ')}\n\n`);
            break;
          case 'HR': parts.push(`\n---\n\n`); break;
          case 'PRE':
            const code = node.querySelector('code');
            if (code) {
              const language = Array.from(node.classList).find(c => c.startsWith('language-'))?.replace('language-', '') || '';
              parts.push(`\n\n\`\`\`${language}\n${code.innerText}\n\`\`\`\n\n`);
            } else {
              parts.push(`\n\n\`\`\`\n${node.innerText}\n\`\`\`\n\n`);
            }
            break;
        }
      }

      // 递归处理所有子节点（确保不遗漏任何元素）
      if (node.nodeType === 1) {
        let child = node.firstChild;
        while (child) {
          walk(child);
          child = child.nextSibling;
        }
      }
    }

    walk(root);
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** 图片转 Base64 */
  async function convertImgToBase64(img) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        if (canvas.width === 0 || canvas.height === 0) {
          reject(new Error('图片尺寸为0'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    });
  }

  /** 处理所有图片 */
  async function processImagesToBase64(container) {
    const images = container.querySelectorAll('img');
    console.log(`🖼️ 发现 ${images.length} 张图片`);
    
    await Promise.allSettled(
      Array.from(images).map(async (img, index) => {
        try {
          const realSrc = img.dataset.src || img.dataset.original;
          const currentSrc = img.src;
          
          if (currentSrc?.startsWith('data:')) {
            console.log(`⏭️ 图片 ${index+1} 已是 Base64`);
            return;
          }
          
          const targetSrc = realSrc || currentSrc;
          if (!targetSrc) {
            console.warn(`⚠️ 图片 ${index+1} 无 src，跳过`);
            return;
          }

          console.log(`🔄 处理图片 ${index+1}/${images.length}`);
          
          const tempImg = new Image();
          tempImg.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            tempImg.onload = () => resolve();
            tempImg.onerror = () => reject(new Error('加载失败'));
            tempImg.src = targetSrc;
          });
          
          const base64 = await convertImgToBase64(tempImg);
          
          img.src = base64;
          img.removeAttribute('data-src');
          img.removeAttribute('data-original');
          
          console.log(`✅ 图片 ${index+1} 转换成功 (${base64.length} 字符)`);
        } catch (err) {
          console.warn(`⚠️ 图片 ${index+1} 失败:`, err.message);
          img.alt = `[图片失败] ${img.alt || ''}`;
        }
      })
    );
    
    const base64Count = Array.from(container.querySelectorAll('img')).filter(img => img.src?.startsWith('data:')).length;
    console.log(`📊 处理结果: ${base64Count}/${images.length} 成功`);
  }

  /** 等待内容加载 */
  function waitForContent(timeout = 30000, selectors = null) {
    const defaultSelectors = ['.article-content', '.post-content', '.ql-editor', 
                              '.rich-content', 'main', 'article', '.entry-content'];
    const selectorList = selectors || defaultSelectors;
    
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = selectorList.map(s => document.querySelector(s)).find(e => e && e.innerText?.length > 0);
        if (el) {
          console.log(`📦 内容已找到 (${el.className || el.tagName})`);
          resolve(el);
        } else if (Date.now() - start > timeout) {
          reject(new Error(`内容加载超时`));
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });
  }

  /** UI 函数 */
  function showLoading(message) {
    removeExistingUI();
    const div = document.createElement('div');
    div.id = 'md-export-loading';
    div.innerHTML = `<div style="position:fixed;top:10px;right:10px;z-index:99999;
                                 background:#4CAF50;color:white;padding:12px 16px;
                                 border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);
                                 font-family:system-ui,sans-serif;font-size:14px;">
      ${message}
    </div>`;
    document.body.appendChild(div);
  }

  function hideLoading() {
    const loading = document.getElementById('md-export-loading');
    if (loading) loading.remove();
  }

  function showSuccess(message) {
    removeExistingUI();
    const div = document.createElement('div');
    div.id = 'md-export-success';
    div.innerHTML = `<div style="position:fixed;top:10px;right:10px;z-index:99999;
                                 background:#2196F3;color:white;padding:12px 16px;
                                 border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);
                                 font-family:system-ui,sans-serif;font-size:14px;">
      ${message}
    </div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  function removeExistingUI() {
    document.getElementById('md-export-loading')?.remove();
    document.getElementById('md-export-success')?.remove();
  }

  /** 文件名净化 */
  function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 100) + '.md';
  }

  /** 主函数 */
  async function main() {
    try {
      showLoading('📥 正在导出文章（Quill 优化版）...');
      console.log('🚀 开始导出任务');
      
      const contentEl = await waitForContent();
      console.log('✅ 内容容器已获取');
      
      const cloneEl = contentEl.cloneNode(true);
      await processImagesToBase64(cloneEl);
      console.log('✅ 图片处理完成');
      
      const markdown = extractContentToMarkdown(cloneEl);
      console.log('✅ Markdown 提取完成');
      
      // 验证结果
      const base64Matches = markdown.match(/!\[.*?\]\(data:image\/\w+;base64,.*?\)/g);
      const codeBlockMatches = markdown.match(/```[\s\S]*?```/g);
      console.log(`📊 最终验证: Base64图片=${base64Matches ? base64Matches.length : 0}, 代码块=${codeBlockMatches ? codeBlockMatches.length : 0}`);
      
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const title = document.querySelector('.article-title, h1')?.innerText.trim() || '文章';
      
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFilename(title);
      a.click();
      
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      hideLoading();
      showSuccess('✅ 导出成功！代码块格式已修复');
      console.log('🎉 全部完成');
      
    } catch (error) {
      console.error('❌ 导出失败:', error);
      hideLoading();
      showSuccess(`❌ 失败: ${error.message}`);
      alert(`错误: ${error.message}\n\n详情请看 Console`);
    }
  }

  // ========== 启动 ==========
  if (location.hostname.includes('articles.zsxq.com')) {
    main();
  } else {
    console.warn('此脚本仅限在知识星球文章页面使用！');
  }
})();