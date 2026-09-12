(function (global) {
    'use strict';
    function start(invoke, ui) {
        return new Promise(resolve => {
            const destination = ui.selectBox([['local', 'On this computer'], ['create', 'Create a shared warehouse'], ['join', 'Join an existing warehouse']]);
            const accounts = ui.selectBox([['accounts', 'Use accounts — sign in with a username and password'], ['open', 'Continue without accounts']]);
            const path = ui.input('text', 'Choose a warehouse data folder');
            const browse = ui.button('Browse folders', false);
            const next = ui.button('Continue', true);
            const status = ui.errline();
            const modeLabel = ui.label('Access mode');
            const note = ui.sub('Without accounts, anyone who can open this warehouse can edit its data. Activity is recorded without individual names.');
            let localPath = '';
            destination.onchange = () => {
                const joining = destination.value === 'join';
                accounts.hidden = modeLabel.hidden = note.hidden = joining;
                path.value = destination.value === 'local' ? localPath : '';
                status.textContent = joining ? 'The existing warehouse keeps its accounts and settings.' : '';
            };
            browse.onclick = async () => {
                try { const selected = await invoke('choose_workspace_folder'); if (selected) path.value = selected; }
                catch (error) { status.textContent = String(error); }
            };
            next.onclick = async () => {
                if (!path.value.trim()) { status.textContent = 'Choose a folder first.'; return; }
                next.disabled = browse.disabled = destination.disabled = accounts.disabled = path.disabled = true;
                status.textContent = 'Checking the folder…';
                try {
                    await invoke('configure_workspace', { path: path.value.trim(), intent: destination.value === 'join' ? 'join' : 'create', accountMode: accounts.value });
                    resolve();
                } catch (error) {
                    status.textContent = String(error);
                    next.disabled = browse.disabled = destination.disabled = accounts.disabled = path.disabled = false;
                }
            };
            const logo = document.createElement('img'); logo.src = 'assets/warehouse-icon.png'; logo.alt = ''; logo.width = logo.height = 64;
            ui.setOverlay([logo, ui.title('Welcome to Warehouse Dashboard'), ui.sub('Step 1 of 3 · Choose where your warehouse lives. You can configure its name and import data next.'), ui.label('How will you use the app?'), destination, ui.label('Data folder'), path, browse, modeLabel, accounts, note, next, status], 500);
            invoke('default_workspace_path').then(value => { localPath = value; if (destination.value === 'local' && !path.value) path.value = value; }).catch(error => { status.textContent = String(error); });
        });
    }
    global.WarehouseSetup = { start };
})(window);
