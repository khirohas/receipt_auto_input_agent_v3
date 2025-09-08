window.addEventListener('DOMContentLoaded', () => {
    // 要素取得
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileListBody = document.getElementById('fileListBody');
    const batchProcessBtn = document.getElementById('batchProcessBtn');
    const excelPreview = document.getElementById('excelPreview');
    const splitter = document.getElementById('splitter');
    const mainArea = document.querySelector('.main-area');
    const previewArea = document.querySelector('.preview-area');
    const wrapper = document.querySelector('.main-preview-wrapper');
    const sidebar = document.querySelector('.sidebar');

    // --- プレビュー復元 ---
    const lastExcelFile = localStorage.getItem('lastExcelFile');
    if (lastExcelFile) {
        fetch(`/api/excel-preview?file=${encodeURIComponent(lastExcelFile)}`)
            .then(res => res.json())
            .then(previewJson => {
                if (previewJson.rows && previewJson.rows.length > 0) {
                    excelPreview.innerHTML = renderExcelTable(previewJson.rows, `/downloads/${lastExcelFile}`);
                }
            });
    }
    // --- 比率復元 ---
    const lastSplit = localStorage.getItem('splitRatio');
    if (lastSplit) {
        const ratio = parseFloat(lastSplit);
        const wrapperRect = wrapper.getBoundingClientRect();
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;
        // 一時的にtransitionを無効化
        mainArea.style.transition = 'none';
        previewArea.style.transition = 'none';
        const mainWidth = (wrapperRect.width - sidebarWidth) * ratio;
        const previewWidth = (wrapperRect.width - sidebarWidth) * (1 - ratio);
        mainArea.style.flexBasis = mainWidth + 'px';
        previewArea.style.width = previewWidth + 'px';
        // 次のフレームでtransitionを元に戻す
        setTimeout(() => {
            mainArea.style.transition = '';
            previewArea.style.transition = '';
        }, 0);
    } else {
        mainArea.style.flexBasis = '600px';
        previewArea.style.width = '300px';
    }

    // 初回リスト取得
    fetchFileList();

    // ファイル選択・フォルダ選択
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // ドラッグ&ドロップ
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
    });
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    function handleFiles(fileList) {
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) {
            alert('画像ファイルを選択してください');
            return;
        }
        
        console.log('選択されたファイル数:', files.length);
        
        // アップロード中表示
        const uploadArea = document.querySelector('.file-upload-area');
        const originalText = uploadArea.querySelector('p').textContent;
        uploadArea.querySelector('p').textContent = `アップロード中... (${files.length}ファイル)`;
        
        // 1ファイルずつアップロード（並列処理を制限）
        uploadFilesSequentially(files, 0, uploadArea, originalText);
    }
    
    async function uploadFilesSequentially(files, index, uploadArea, originalText) {
        if (index >= files.length) {
            uploadArea.querySelector('p').textContent = originalText;
            fetchFileList();
            return;
        }
        
        try {
            console.log(`アップロード中: ${index + 1}/${files.length} - ${files[index].name}`);
            await uploadFile(files[index]);
            console.log(`アップロード完了: ${index + 1}/${files.length} - ${files[index].name}`);
            
            // 次のファイルをアップロード
            uploadFilesSequentially(files, index + 1, uploadArea, originalText);
        } catch (err) {
            console.error(`アップロードエラー (${files[index].name}):`, err);
            uploadArea.querySelector('p').textContent = originalText;
            alert(`ファイル "${files[index].name}" のアップロードに失敗しました: ${err.message}`);
        }
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'アップロードに失敗しました');
        }
        return res.json();
    }

    async function fetchFileList() {
        try {
            const res = await fetch('/api/files');
            const files = await res.json();
            console.log('取得したファイル数:', files.length);
            updateFileTable(files);
        } catch (err) {
            console.error('ファイルリスト取得エラー:', err);
        }
    }

    function updateFileTable(files) {
        fileListBody.innerHTML = '';
        files.forEach((f) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.name}</td>
                <td>${formatDate(f.date)}</td>
                <td>${formatFileSize(f.size)}</td>
                <td><button class="delete-btn" data-id="${f.id}">削除</button></td>
            `;
            fileListBody.appendChild(tr);
        });
        // 削除ボタンイベント
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const id = btn.getAttribute('data-id');
                try {
                    const res = await fetch('/api/delete-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    if (res.ok) {
                        fetchFileList();
                    } else {
                        const error = await res.json();
                        alert('削除に失敗しました: ' + error.error);
                    }
                } catch (err) {
                    alert('削除に失敗しました: ' + err.message);
                }
            };
        });
    }

    function formatDate(date) {
        const d = new Date(date);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/1024/1024).toFixed(1) + ' MB';
    }

    // バッチ処理ボタン
    batchProcessBtn.addEventListener('click', async () => {
        excelPreview.innerHTML = '<div class="excel-status-bar">処理中...<div class="bar"></div></div>';
        try {
            const res = await fetch('/api/batch-process', { method: 'POST' });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }
            
            const result = await res.json();
            console.log('バッチ処理結果:', result);
            
            if (result.success) {
                // メモリベースのExcelファイルをダウンロード
                if (result.fileData) {
                    const blob = new Blob([Uint8Array.from(atob(result.fileData), c => c.charCodeAt(0))], {
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    });
                    const url = URL.createObjectURL(blob);
                    
                    let errorMessage = '';
                    if (result.errors && result.errors.length > 0) {
                        errorMessage = `<div style="color: #ff6b6b; margin: 8px 0; font-size: 14px;">
                            処理できなかったファイル: ${result.errors.length}件
                        </div>`;
                    }
                    
                    // Excelプレビューを取得
                    try {
                        const previewRes = await fetch(`/api/excel-preview?file=${encodeURIComponent(result.fileData)}`);
                        if (previewRes.ok) {
                            const previewJson = await previewRes.json();
                            if (previewJson.rows && previewJson.rows.length > 0) {
                                excelPreview.innerHTML = `
                                    <div style="margin-bottom: 12px;">
                                        <a href="${url}" class="upload-option-btn" download="${result.fileName}">📄 Excelダウンロード</a>
                                        <p style="margin: 8px 0; color: #666;">処理件数: ${result.processedCount}件 | 合計金額: ¥${result.totalAmount.toLocaleString()}</p>
                                        ${errorMessage}
                                    </div>
                                    ${renderExcelTable(previewJson.rows, url)}
                                `;
                            } else {
                                excelPreview.innerHTML = `
                                    <div style="margin-bottom: 12px;">
                                        <a href="${url}" class="upload-option-btn" download="${result.fileName}">📄 Excelダウンロード</a>
                                        <p style="margin: 8px 0; color: #666;">処理件数: ${result.processedCount}件 | 合計金額: ¥${result.totalAmount.toLocaleString()}</p>
                                        ${errorMessage}
                                    </div>
                                    <div style="color: #1fa7a2;">Excelファイルが生成されました。上記リンクからダウンロードしてください。</div>
                                `;
                            }
                        } else {
                            throw new Error('プレビュー取得に失敗');
                        }
                    } catch (previewErr) {
                        console.error('プレビュー取得エラー:', previewErr);
                        excelPreview.innerHTML = `
                            <div style="margin-bottom: 12px;">
                                <a href="${url}" class="upload-option-btn" download="${result.fileName}">📄 Excelダウンロード</a>
                                <p style="margin: 8px 0; color: #666;">処理件数: ${result.processedCount}件 | 合計金額: ¥${result.totalAmount.toLocaleString()}</p>
                                ${errorMessage}
                            </div>
                            <div style="color: #1fa7a2;">Excelファイルが生成されました。上記リンクからダウンロードしてください。</div>
                        `;
                    }
                } else {
                    excelPreview.innerHTML = '<div style="color:#1fa7a2;">Excelファイルが生成されました</div>';
                }
                // ファイルリストもリフレッシュ
                fetchFileList();
            } else {
                excelPreview.innerHTML = `<div style='color:#d00;'>${result.error || 'バッチ処理に失敗しました'}</div>`;
            }
        } catch (err) {
            console.error('バッチ処理エラー:', err);
            excelPreview.innerHTML = `<div style='color:#d00;'>エラー: ${err.message}</div>`;
        }
    });

    // Excelプレビュー用テーブル描画関数
    function renderExcelTable(rows, downloadUrl) {
        let html = '';
        if (downloadUrl) {
            html += `<a href="${downloadUrl}" class="upload-option-btn" download style="margin-bottom:12px;display:inline-block;">📄 Excelダウンロード</a>`;
        }
        html += '<table class="excel-preview-table"><thead><tr>';
        rows[0].forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';
        for (let i = 1; i < rows.length; i++) {
            const isBoldRow = rows[i][8] && (
                rows[i][8].includes('小計') ||
                rows[i][8].includes('消費税') ||
                rows[i][8].includes('合計金額')
            );
            html += '<tr>';
            rows[i].forEach((cell, idx) => {
                if (isBoldRow && (idx === 8 || idx === 9)) {
                    html += `<td class="bold-cell">${cell !== undefined ? cell : ''}</td>`;
                } else {
                    html += `<td>${cell !== undefined ? cell : ''}</td>`;
                }
            });
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    // 全クリアボタン
    document.getElementById('clearAllBtn').onclick = async () => {
        if (!confirm('本当に全てのファイルを削除しますか？')) return;
        await fetch('/api/clear-files', { method: 'POST' });
        fetchFileList();
        // プレビューも消去
        excelPreview.innerHTML = '';
        localStorage.removeItem('lastExcelFile');
    };

    // スプリッターによるリサイズ
    let isDragging = false;
    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        splitter.classList.add('active');
        document.body.style.cursor = 'col-resize';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const wrapperRect = wrapper.getBoundingClientRect();
        let x = e.clientX - wrapperRect.left;
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 0;
        x = Math.max(x, sidebarWidth + 50); // main最小
        x = Math.min(x, wrapperRect.width - 50); // preview最小
        const mainWidth = x - sidebarWidth;
        const previewWidth = wrapperRect.width - x;
        mainArea.style.flexBasis = mainWidth + 'px';
        previewArea.style.width = previewWidth + 'px';
        // 比率をlocalStorageに保存
        const ratio = mainWidth / (mainWidth + previewWidth);
        localStorage.setItem('splitRatio', ratio);
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            splitter.classList.remove('active');
            document.body.style.cursor = '';
        }
    });
}); 