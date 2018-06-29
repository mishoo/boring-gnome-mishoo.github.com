const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup.WorkspaceSwitcherPopup;
const Shell = imports.gi.Shell;
const GLib = imports.gi.GLib;

const ICON_SIZE = 24;

function setTimeout(func, millis) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, millis, function() {
        func();
        return false; // no repeat
    });
}

function clearTimeout(id) {
    GLib.Source.remove(id);
}

function add_class(widget, cls) {
    widget.add_style_class_name(cls);
}

function remove_class(widget, cls) {
    widget.remove_style_class_name(cls);
}

function cond_class(widget, condition, clsTrue, clsFalse) {
    if (condition) {
        add_class(widget, clsTrue);
        if (clsFalse) remove_class(widget, clsFalse);
    } else {
        remove_class(widget, clsTrue);
        if (clsFalse) add_class(widget, clsFalse);
    }
    return condition;
}

const SchemaSource = Gio.SettingsSchemaSource.new_from_directory(
    Me.dir.get_path(), Gio.SettingsSchemaSource.get_default(), false);

const SettingsSchema = SchemaSource.lookup(Me.metadata['settings-schema'], true);

const settings = new Gio.Settings({
    settings_schema: SettingsSchema
});

function Connector() {
    let disconnect = [];
    return {
        on: function(object, event, handler) {
            let id = object.connect(event, handler);
            disconnect.push(object.disconnect.bind(object, id));
        },
        off: function() {
            while (disconnect.length > 0) disconnect.pop()();
        }
    };
}

let HANDLERS = {};
let PREVIOUS;
let WORKSPACE_DISPLAY_FUNC = null;

/* -----[ the meat follows ]----- */

function CTRL(ev) {
    return ev.get_state() & Clutter.ModifierType.CONTROL_MASK;
}

function cycle_workspaces(display, screen){
    if (PREVIOUS != null) {
        let ws = screen.get_workspace_by_index(PREVIOUS);
        Main.wm.actionMoveWorkspace(ws);
    }
}

function cycle_workspaces_take_window(display, screen) {
    if (PREVIOUS != null) {
        let activeWindow = display.focus_window;
        if (activeWindow) {
            let ws = screen.get_workspace_by_index(PREVIOUS);
            Main.wm.actionMoveWindow(activeWindow, ws);
        }
    }
}

function find_window_by_name() {
    let layout = new St.BoxLayout({
        style_class: "find-window-by-name",
        accessible_role: Atk.Role.DIALOG
    });
    layout.set_vertical(true);

    let winlist = new St.BoxLayout({ style_class: "window-list" });
    let selected = 0;
    winlist.set_vertical(true);

    // I found this somewhere.  Not in a documentation, though.  It
    // returns the list of windows (as MetaWindow objects from Mutter,
    // rather than Clutter actors) in an order suitable for doing
    // alt-tab switching.  Perfect for what we need.
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null);

    // except that, if we want to switch to a different window, it
    // seems the current window is the last one that we'd potentially
    // want to see.
    windows.push(windows.shift());

    let entries = windows.map((window, idx) => {
        let entry = TaskBar.make_win_button(window);
        // entry.btn.connect("button-press-event", function(){
        //     close();
        // });
        return Object.assign(entry, {
            class   : window.get_wm_class(),
            index   : idx,
            visible : true
        });
    });
    refresh(true);

    let entry = new St.Entry({ style_class: "search-entry", can_focus: true });
    layout.add_child(entry);
    layout.add_child(winlist);

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
            // no need to close, it'll be dismissed by the focus-out
            // handler. //  close();
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
        let queries = entry.get_text().toLowerCase().trim().split(/\s+/);
        entries.forEach(entry => {
            let title = (entry.title + " " + entry.class).toLowerCase();
            let visible = true;
            for (var i = 0; i < queries.length; ++i) {
                if (title.indexOf(queries[i]) < 0) {
                    visible = false;
                    break;
                }
            }
            entry.visible = visible;
        });
        refresh(true);
    });

    entry.clutter_text.connect("key-focus-out", close);

    function refresh(hard = true) {
        if (hard) {
            let has_selected = false;
            winlist.remove_all_children();
            entries.forEach((entry, index) => {
                entry.index = index;
                if (entry.visible) {
                    winlist.add_child(entry.actor);
                    if (cond_class(entry.actor, index === selected, "selected")) {
                        has_selected = true;
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
            entries.forEach(({ actor, visible, index }) => {
                cond_class(actor, index === selected, "selected");
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
    Main.wm._switchWorkspaceDone(shellwm); // kill animation, dammit
    PREVIOUS = from;                       // last used workspace
}

/* -----[ task bar ]----- */

let TaskBar = function(){

    const BOX_VCENTER = { y_fill: false, y_align: St.Align.MIDDLE };
    let container;
    let handlers;
    let cache;

    function init() {
        handlers = Connector();
        cache = {
            button: new Map(),
            workspace: new Map()
        };

        container = new St.BoxLayout({ style_class: "taskbar" });
        Main.panel._leftBox.insert_child_at_index(container, 1);
        handlers.on(global.window_manager, "switch-workspace", on_switch_workspace);
        handlers.on(global.screen, "notify::n-workspaces", on_workspaces_changed);
        handlers.on(global.display, "notify::focus-window", on_focus_window);
        refresh();
        on_workspaces_changed();
    }

    function destroy() {
        handlers.off();
        for (let [workspace, handlers] of cache.workspace) {
            handlers.off();
        }
        for (let [window, { handlers }] of cache.button) {
            handlers.off();
        }
        cache = null;
        container.destroy();
    }

    function on_switch_workspace() {
        refresh();
    }

    // this mostly copied from window-list (official extension).
    function on_workspaces_changed() {
        let n = global.screen.n_workspaces;
        for (let i = 0; i < n; ++i) {
            let workspace = global.screen.get_workspace_by_index(i);
            if (!cache.workspace.has(workspace)) {
                let handlers = Connector();
                handlers.on(workspace, "window-added", on_window_added, handlers);
                handlers.on(workspace, "window-removed", on_window_removed, handlers);
                cache.workspace.set(workspace, handlers);
            }
        }
    }

    function on_window_added(workspace, window) {
        refresh();              // let's take the easy route
    }

    function on_window_removed(workspace, window) {
        refresh();
    }

    function refresh() {
        container.remove_all_children();
        let workspace = global.screen.get_active_workspace();
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        windows.forEach(window => {
            let x = cached_win_button(window);
            container.add(x.actor);
        });
    }

    function on_focus_window() {
        for (let [window, btn] of cache.button) {
            cond_class(btn.actor, is_active_window(window), "active");
            cond_class(btn.actor, window.minimized, "minimized");
        }
    }

    function cached_win_button(window) {
        let bag = cache.button;
        let entry = bag.get(window);
        if (!entry) {
            entry = make_win_button(window);
            bag.set(window, entry);
            cond_class(entry.actor, is_active_window(window), "active");

            // setup new window button
            entry.btn.connect("clicked", function(_, button){
                if (button == 1) {
                    toggle_window(window);
                } else {
                    let menuType = Meta.WindowMenuType.WM;
                    let [ x, y ] = entry.btn.get_transformed_position();
                    let [ width, height ] = entry.btn.get_size();
                    let rect = { x, y, width, height };
                    Main.wm._windowMenuManager.showWindowMenuForWindow(window, menuType, rect);
                }
            });
            let handlers = entry.handlers = Connector();
            handlers.on(window, "unmanaged", function(){
                handlers.off();
                bag.delete(window);
                entry.actor.destroy();
            });
            handlers.on(window, "notify::title", entry.update_title);
            handlers.on(window, "notify::wm-class", entry.update_icon);
            handlers.on(window, "notify::gtk-application-id", entry.update_icon);
            entry.label.connect("destroy", function(){
                // global.log(`******** LABEL DESTROYED (${entry.title})`);
                // global.log(new Error().stack);
                handlers.off();
                entry.actor.destroy();
            });
        }
        return entry;
    }

    function make_win_button(window) {
        let title = window.get_title();
        let label = new St.Label({ text: title, style_class: "window-title" });
        let icon = new St.Bin({ style_class: "window-icon" });

        let btn = new St.Button({ style_class: "window-button panel-button",
                                  //can_focus: true,
                                  x_fill: true, y_fill: true,
                                  button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE });

        let box = new St.BoxLayout({ style_class: "window-row" });
        box.add(icon, BOX_VCENTER);
        box.add(label, BOX_VCENTER);
        btn.set_child(box);

        let entry = {
            actor         : btn,
            btn           : btn,
            label         : label,
            window        : window,
            title         : title,
            box           : box,
            update_title  : update_title,
            update_icon   : update_icon
        };

        update_icon();
        return entry;

        function update_title() {
            label.set_text(entry.title = window.get_title());
        }

        function update_icon() {
            let app = Shell.WindowTracker.get_default().get_window_app(window);
            if (app) {
                icon.set_child(app.create_icon_texture(ICON_SIZE));
            } else {
                icon.set_child(new St.Icon({ icon_name: "icon-missing", icon_size: ICON_SIZE }));
            }
        }
    }

    function is_active_window(window) {
        let fw = global.display.focus_window;
        return fw == window || (fw && fw.get_transient_for() == window);
    }

    function toggle_window(window) {
        if (is_active_window(window)) {
            window.minimize();
        } else {
            Main.activateWindow(window);
        }
    }

    return {
        init            : init,
        destroy         : destroy,
        make_win_button : make_win_button
    };

}();

function focus_window_actor() {
    let fw = global.display.focus_window;
    // there probably is some simpler way to do this, but I couldn't
    // find it.  display.focus_window is a Mutter MetaWindow object,
    // but we really need its associated ClutterActor.
    if (fw) {
        let windows = global.get_window_actors();
        for (var i = windows.length; --i >= 0;) {
            let win = windows[i];
            if (win.get_meta_window() === fw) {
                return win;
            }
        }
    }
}

function rotate_window(angle) {
    let fw = focus_window_actor();
    if (fw) {
        fw.set_pivot_point(0.5, 0.5);
        Tweener.addTween(fw, {
            time: 0.5,
            transition: "easeOutQuad",
            rotation_angle_z: angle ? fw.rotation_angle_z + angle : 0
        });
    }
}

function scale_window(factor) {
    let fw = focus_window_actor();
    if (fw) {
        fw.set_pivot_point(0.5, 0.5);
        Tweener.addTween(fw, {
            time: 0.5,
            transition: "easeOutQuad",
            scale_x: factor ? fw.scale_x * factor : 1,
            scale_y: factor ? fw.scale_y * factor : 1
        });
    }
}

function reset_zoom_scale_window() {
    let fw = focus_window_actor();
    if (fw) {
        fw.set_pivot_point(0.5, 0.5);
        Tweener.addTween(fw, {
            time: 0.5,
            transition: "easeOutQuad",
            rotation_angle_z: 0,
            scale_x: 1,
            scale_y: 1
        });
    }
}

/* -----[ entry points ]----- */

function init() {
}

function enable() {
    HANDLERS.switch = global.window_manager.connect('switch-workspace', on_switch_workspace);
    WORKSPACE_DISPLAY_FUNC = WorkspaceSwitcherPopup.prototype.display;
    WorkspaceSwitcherPopup.prototype.display = function(){}; // kill the popup
    addKeybinding("cycle-workspaces", cycle_workspaces);
    addKeybinding("cycle-workspaces-take-window", cycle_workspaces_take_window);
    addKeybinding("find-window-by-name", find_window_by_name);
    addKeybinding("rotate-window-right", rotate_window.bind(null, 10));
    addKeybinding("rotate-window-left", rotate_window.bind(null, -10));
    addKeybinding("zoom-in-window", scale_window.bind(null, 1.1));
    addKeybinding("zoom-out-window", scale_window.bind(null, 1/1.1));
    addKeybinding("reset-window-zoom-and-scale", reset_zoom_scale_window);
    TaskBar.init();
    Main.panel.statusArea.activities.container.hide();

    function addKeybinding(name, handler) {
        Main.wm.addKeybinding(name, settings, 0,
                              Shell.ActionMode.NORMAL |
                              Shell.ActionMode.OVERVIEW,
                              handler);
    }
}

function disable() {
    global.window_manager.disconnect(HANDLERS.switch);
    WorkspaceSwitcherPopup.prototype.display = WORKSPACE_DISPLAY_FUNC;
    Main.wm.removeKeybinding("cycle-workspaces");
    Main.wm.removeKeybinding("cycle-workspaces-take-window");
    Main.wm.removeKeybinding("find-window-by-name");
    Main.wm.removeKeybinding("rotate-window-right");
    Main.wm.removeKeybinding("rotate-window-left");
    Main.wm.removeKeybinding("zoom-in-window");
    Main.wm.removeKeybinding("zoom-out-window");
    Main.wm.removeKeybinding("reset-window-zoom-and-scale");
    TaskBar.destroy();
    Main.panel.statusArea.activities.container.show();
}
