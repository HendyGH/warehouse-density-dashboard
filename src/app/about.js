(function (global) {
    'use strict';
    function open() {
        if (document.getElementById('warehouseAbout')) return;
        const modal = document.createElement('div'); modal.id = 'warehouseAbout'; modal.className = 'warehouse-dialog';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'About Warehouse Dashboard');
        const panel = document.createElement('div'); panel.className = 'warehouse-panel';
        panel.innerHTML = '<img src="assets/warehouse-icon.png" alt="Warehouse Dashboard icon" width="88" height="88"><h2>Warehouse Dashboard</h2><p data-version>Version 2.1.1</p><p>An offline-capable warehouse dashboard for storage density, inventory visibility, snapshots, and configurable warehouse workflows.</p><p data-profile></p><p data-access></p><p>Your operational data stays in the warehouse folder you choose. Back up that folder regularly.</p><p>Project and documentation: github.com/HendyGH/warehouse-density-dashboard</p><button class="warehouse-primary" data-close>Close</button>';
        panel.querySelector('[data-profile]').textContent = 'Warehouse: ' + (global.WarehouseProfile && global.WarehouseProfile.profile.name || 'Not configured');
        panel.querySelector('[data-access]').textContent = global.WarehouseAccess ? (global.WarehouseAccess.accountFree ? 'Access: No-account mode' : 'Access: Accounts enabled') : 'Browser preview';
        const before = document.activeElement;
        panel.querySelector('[data-close]').onclick = () => { modal.remove(); if (before && before.focus) before.focus(); };
        modal.appendChild(panel); document.body.appendChild(modal); panel.querySelector('[data-close]').focus();
    }
    // Keep keyboard navigation inside our modal dialogs.
    document.addEventListener('keydown', event => {
        const dialogs = document.querySelectorAll('.warehouse-dialog'); const modal = dialogs[dialogs.length - 1];
        if (!modal) return;
        if (event.key === 'Escape') { const close = modal.querySelector('[data-close], [data-skip]'); if (close) { event.preventDefault(); close.click(); } }
        if (event.key !== 'Tab') return;
        const elements = Array.from(modal.querySelectorAll('button,input,textarea,select,a[href]')).filter(element => !element.disabled && element.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
    global.WarehouseAbout = { open };
})(window);
