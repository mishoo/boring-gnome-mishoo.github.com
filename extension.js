const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const WM = imports.ui.main.wm;
const Gio = imports.gi.Gio;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup.WorkspaceSwitcherPopup;
const Shell = imports.gi.Shell;
const GLib = imports.gi.GLib;

function setTimeout(func, millis) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, millis, function() {
        func();
        return false; // no repeat
    });
}

function clearTimeout(id) {
    GLib.Source.remove(id);
}

const SchemaSource = Gio.SettingsSchemaSource.new_from_directory(
    Me.dir.get_path(), Gio.SettingsSchemaSource.get_default(), false);

const SettingsSchema = SchemaSource.lookup(Me.metadata['settings-schema'], true);

const settings = new Gio.Settings({
    settings_schema: SettingsSchema
});

function addKeybinding(name, handler) {
    Main.wm.addKeybinding(name, settings, 0,
                          Shell.ActionMode.NORMAL |
                          Shell.ActionMode.OVERVIEW,
                          handler);
}

const BOX_VCENTER = { y_fill: false, y_align: St.Align.MIDDLE };

let HANDLERS = {};
let PREVIOUS;
let WORKSPACE_DISPLAY_FUNC = null;

function init() {
}

function enable() {
    HANDLERS.switch = global.window_manager.connect('switch-workspace', on_switch_workspace.bind(WM));
    WORKSPACE_DISPLAY_FUNC = WorkspaceSwitcherPopup.prototype.display;
    WorkspaceSwitcherPopup.prototype.display = function(){}; // kill the popup
    addKeybinding("cycle-workspaces", function(display, screen){
        if (PREVIOUS != null) {
            let ws = screen.get_workspace_by_index(PREVIOUS);
            Main.wm.actionMoveWorkspace(ws);
        }
    });
    addKeybinding("cycle-workspaces-take-window", function(display, screen) {
        if (PREVIOUS != null) {
            let activeWindow = global.display.focus_window;
            if (activeWindow) {
                let ws = screen.get_workspace_by_index(PREVIOUS);
                Main.wm.actionMoveWindow(activeWindow, ws);
            }
        }
    });
    addKeybinding("find-window-by-name", findWindowByName);
}

function disable() {
    global.window_manager.disconnect(HANDLERS.switch);
    WorkspaceSwitcherPopup.prototype.display = WORKSPACE_DISPLAY_FUNC;
    Main.wm.removeKeybinding("cycle-workspaces");
    Main.wm.removeKeybinding("cycle-workspaces-take-window");
    Main.wm.removeKeybinding("find-window-by-name");
}

/* -----[ the meat follows ]----- */

function CTRL(ev) {
    return ev.get_state() & Clutter.ModifierType.CONTROL_MASK;
}

function findWindowByName() {
    let layout = new St.BoxLayout({
        style_class: "find-window-by-name",
        accessible_role: Atk.Role.DIALOG
    });
    layout.set_vertical(true);

    let windows_box = new St.BoxLayout({ style_class: "window-list" });
    let selected = 0;
    windows_box.set_vertical(true);

    // I found this somewhere.  Not in a documentation, though.  It
    // returns the list of windows (as MetaWindow objects from Mutter,
    // rather than Clutter actors) in an order suitable for doing
    // alt-tab switching.  Perfect for what we need.
    let window_actors = global.display.get_tab_list(Meta.TabList.NORMAL, null);

    // except that, if we want to switch to a different window, it
    // seems the current window is the last one that we'd potentially
    // want to see.
    window_actors.push(window_actors.shift());

    let entries = window_actors.map((window, idx) => {
        let title = window.get_title();
        let klass = window.get_wm_class();
        let label = new St.Label({ text: title, style_class: "window-title" });
        let icon = new St.Bin({ style_class: "window-icon" });

        let app = Shell.WindowTracker.get_default().get_window_app(window);
        if (app) {
            icon.set_child(app.create_icon_texture(24));
        } else {
            icon.set_child(new St.Icon({ icon_name: 'icon-missing', icon_size: 24 }));
        }

        let box = new St.BoxLayout({ style_class: "window-row" });
        box.add(icon, BOX_VCENTER);
        box.add(label, BOX_VCENTER);

        return {
            window  : window,
            title   : title,
            class   : klass,
            box     : box,
            index   : idx,
            visible : true
        };
    });
    refresh(true);

    let entry = new St.Entry({ style_class: "search-entry", can_focus: true });
    layout.add_child(entry);
    layout.add_child(windows_box);

    Main.uiGroup.add_child(layout);
    entry.grab_key_focus();

    center(layout);
    layout.set_width(layout.width); // to keep it fixed

    // XXX: why in the world do I need to connect these handlers to
    // `entry.clutter_text` rather than `entry` beats me.
    entry.clutter_text.connect("key-press-event", (entry, ev) => {
        let symbol = ev.get_key_symbol();
        let char = ev.get_key_unicode();
        if (symbol == Clutter.KEY_Escape) {
            close();
            return Clutter.EVENT_STOP;
        }
        if (symbol == Clutter.KEY_Return) {
            if (selected != null) {
                Main.activateWindow(entries[selected].window);
            }
            close();
            return Clutter.EVENT_STOP;
        }
        if (symbol == Clutter.KEY_Up || (CTRL(ev) && char == "p")) {
            handle_down();
            return Clutter.EVENT_STOP;
        }
        if (symbol == Clutter.KEY_Down || (CTRL(ev) && char == "n")) {
            handle_up();
            return Clutter.EVENT_STOP;
        }
        if (CTRL(ev) && char == "g") {
            close();
            return Clutter.EVENT_STOP;
        }
        if (CTRL(ev) && char == "s") {
            handle_up_emacsen();
            return Clutter.EVENT_STOP;
        }
        if (CTRL(ev) && char == "r") {
            handle_down_emacsen();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    entry.clutter_text.connect("text-changed", () => {
        let text = entry.get_text().toLowerCase();
        entries.forEach(entry => {
            entry.visible = [ entry.title, entry.class ].join(" ").toLowerCase().indexOf(text) >= 0;
        });
        refresh(true);
    });

    entry.clutter_text.connect("key-focus-out", close);

    function refresh(hard = true) {
        if (hard) {
            let has_selected = false;
            windows_box.remove_all_children();
            entries.forEach((entry, index) => {
                entry.index = index;
                if (entry.visible) {
                    windows_box.add_child(entry.box);
                    if (index === selected) {
                        has_selected = true;
                        entry.box.add_style_class_name("selected");
                    } else {
                        entry.box.remove_style_class_name("selected");
                    }
                }
            });
            if (!has_selected) {
                let first = get_first_visible();
                if (first != null) {
                    selected = first;
                    refresh(false);
                }
            }
        } else {
            entries.forEach(({ box, visible, index }) => {
                if (index === selected) {
                    box.add_style_class_name("selected");
                } else {
                    box.remove_style_class_name("selected");
                }
            });
        }
    }

    function get_first_visible(start = 0) {
        for (let i = start; i < entries.length; ++i) {
            if (entries[i].visible) {
                return i;
            }
        }
    }

    function get_last_visible(start = entries.length) {
        for (let i = start; --i >= 0;) {
            if (entries[i].visible) {
                return i;
            }
        }
    }

    function handle_up() {
        let next = get_first_visible(selected + 1);
        if (next != null) {
            selected = next;
            refresh(false);
        }
    }

    function handle_down() {
        let prev = get_last_visible(selected);
        if (prev != null) {
            selected = prev;
            refresh(false);
        }
    }

    function handle_up_emacsen() {
        let first = get_first_visible(0);
        if (first != null) {
            entries.push(entries.splice(first, 1)[0]);
            refresh(true);
        }
    }

    function handle_down_emacsen() {
        let last = get_last_visible();
        if (last != null) {
            entries.unshift(entries.splice(last, 1)[0]);
            refresh(true);
        }
    }

    function close() {
        layout.destroy();
    }
}

function center(actor) {
    let monitor = Main.layoutManager.primaryMonitor;
    actor.set_position(
        monitor.x + Math.floor((monitor.width - actor.width) / 2),
        monitor.y + Math.floor((monitor.height - actor.height) / 2)
    );
}

function on_switch_workspace(shellwm, from, to, direction) {
    this._switchWorkspaceDone(shellwm); // kill animation, dammit
    PREVIOUS = from;                    // last used workspace
}
