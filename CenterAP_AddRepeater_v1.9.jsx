/* Center AnchorPoint + Repeater (Shape Layers) — v1.9.3
   - Centers layer Transform > Anchor Point to the visual center (no visual jump)
   - Adds a Repeater to Contents
   - Links Repeater Transform > Anchor to layer Transform > Anchor via expression
   - Anchor snapshot saved to Effect "AP Memory" (2D Point Control) after "Do It"
   - Repeater Transform > Position is LEFT FREE by default (move/animate directly)
   - Presets (applied to the **new** repeater):
       * Default: leave AE defaults; Position free
       * Vertical Repeater: copies=10, position=[0, height]
       * Horizontal Repeater: copies=10, position=[width, 0]
       * Spiral Repeater: copies=10, position=[0,0], rotation=10
   Created by Stephen @ Drywater Dev Co.  contact: stephen@drywaterproductions.com
*/

(function (thisObj) {
    // ---------- UI ----------
    function buildUI(container) {
        container.orientation = "column";
        container.alignChildren = ["fill","top"];
        container.margins = 10;

        var title = container.add("statictext", undefined, "Center Anchor + Add Repeater");
        title.justify = "center";

        // Preset row
        var rowPreset = container.add("group"); rowPreset.orientation = "row"; rowPreset.alignChildren = ["left","center"];
        rowPreset.add("statictext", undefined, "Preset:");
        var ddPreset = rowPreset.add("dropdownlist", undefined, ["Default", "Vertical Repeater", "Horizontal Repeater", "Spiral Repeater"]);
        ddPreset.selection = 0;

        // Row: main action
        var row1 = container.add("group"); row1.orientation = "row"; row1.alignChildren = ["fill","center"];
        var btnDoIt = row1.add("button", undefined, "Do It");
        btnDoIt.alignment = ["fill","fill"];

        // Row: memory controls
        var row2 = container.add("group"); row2.orientation = "row"; row2.alignChildren = ["fill","center"];
        var btnUpdate = row2.add("button", undefined, "Update Anchor");
        var btnReset  = row2.add("button", undefined, "Reset Anchor");
        btnUpdate.alignment = ["fill","fill"];
        btnReset.alignment  = ["fill","fill"];

        // Row: About
        var row3 = container.add("group"); row3.orientation = "row"; row3.alignChildren = ["fill","center"];
        var btnAbout = row3.add("button", undefined, "About");
        btnAbout.alignment = ["fill","fill"];

        var hint = container.add("statictext", undefined, "Select one shape layer, pick a preset, then Do It.");
        hint.characters = 52;

        btnDoIt.onClick   = function(){ main(ddPreset.selection ? ddPreset.selection.text : "Default"); };
        btnUpdate.onClick = onUpdateAnchor;
        btnReset.onClick  = onResetAnchor;
        btnAbout.onClick  = onAbout;

        container.layout.layout(true);
        container.onResizing = container.onResize = function(){ this.layout.resize(); };
    }

    // ---------- Main ----------
    function main(presetName) {
        app.beginUndoGroup("Center AP + Add Repeater");
        try {
            var comp  = getCompOrThrow();
            var layer = getSingleShapeLayerOrThrow(comp);

            // 1) Center layer anchor to visual bounds (and compensate Position)
            centerLayerAnchorToContents(layer);

            // 2) Add a Repeater to layer Contents
            var repeater = addRepeater(layer);

            // 3) Bind: Repeater Anchor -> layer Anchor; leave Repeater Position free (clear any legacy expr)
            bindRepeater(layer, repeater);

            // 4) Apply preset tweaks to the newly added repeater (robust width/height & property find)
            applyRepeaterPreset(layer, repeater, presetName);

            // 5) Auto-save the anchor snapshot
            saveAnchorToMemory(layer);

        } catch (err) {
            alert("Center AP + Repeater\n" + err);
        } finally {
            app.endUndoGroup();
        }
    }

    function onUpdateAnchor() {
        app.beginUndoGroup("Update Anchor (AP Memory)");
        try {
            var comp  = getCompOrThrow();
            var layer = getSingleShapeLayerOrThrow(comp);
            saveAnchorToMemory(layer);
        } catch (e) {
            alert("Update Anchor\n" + e);
        } finally {
            app.endUndoGroup();
        }
    }

    function onResetAnchor() {
        app.beginUndoGroup("Reset Anchor from Memory");
        try {
            var comp  = getCompOrThrow();
            var layer = getSingleShapeLayerOrThrow(comp);
            var saved = getSavedAnchor(layer);
            if (!saved) throw 'No saved anchor found.\nClick "Update Anchor" (or run "Do It") first.';
            setAnchorAndCompensate(layer, saved);
        } catch (e) {
            alert("Reset Anchor\n" + e);
        } finally {
            app.endUndoGroup();
        }
    }

    function onAbout() {
        var msg = "Center Anchor Point + Add Repeater is a script by Stephen @ Drywater Dev Co.  " +
                  "It takes the pain out of repeaters on shape layers being jacked up.  " +
                  "Simply create a shape layer anywhere, then run the script.  " +
                  "It will center the repeater anchor point to allow for the repeater to centered.  " +
                  "You can still move the center of the repeater by moving the anchor point of the shape layer.  " +
                  "If you manually move the anchor point, you can reset it via the \"Reset Anchor\" button, which will re-center the anchor point.";
        alert(msg, "About: Center Anchor + Add Repeater");
    }

    // ---------- Core helpers ----------
    function getCompOrThrow() {
        var comp = app.project && app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) throw "Open a comp and select exactly one shape layer.";
        return comp;
    }
    function getSingleShapeLayerOrThrow(comp) {
        var sel = comp.selectedLayers || [];
        if (sel.length !== 1) throw "Select exactly ONE shape layer.";
        var layer = sel[0];
        if (layer.matchName !== "ADBE Vector Layer") throw "Selected layer is not a Shape Layer.";
        return layer;
    }

    // Anchor ops
    function setAnchorAndCompensate(layer, newAP) {
        var tr  = layer.property("ADBE Transform Group");
        var ap  = tr && tr.property("ADBE Anchor Point");
        var pos = tr && tr.property("ADBE Position");
        if (!ap || !pos) throw "Could not access layer Anchor/Position.";

        var oldAP = ap.value;
        var delta = [newAP[0] - oldAP[0], newAP[1] - oldAP[1]];

        ap.setValue([newAP[0], newAP[1]]);
        pos.setValue([pos.value[0] + delta[0], pos.value[1] + delta[1]]);
    }
    function centerLayerAnchorToContents(layer) {
        var contents = layer.property("ADBE Root Vectors Group");
        if (!contents || contents.numProperties === 0) {
            throw "The shape layer has no contents. Add a shape first.";
        }
        var t = layer.time;
        var r = layer.sourceRectAtTime(t, false);
        var newAP = [r.left + r.width / 2, r.top + r.height / 2];
        setAnchorAndCompensate(layer, newAP);
    }

    // Repeater ops
    function addRepeater(layer) {
        var contents = layer.property("ADBE Root Vectors Group");
        if (!contents) throw "Could not access layer Contents.";
        var repeater = contents.addProperty("ADBE Vector Filter - Repeater");
        if (!repeater) throw "Could not add Repeater.";
        return repeater;
    }

    function bindRepeater(layer, repeater) {
        var repXform =
            repeater.property("ADBE Vector Repeater Transform") ||
            repeater.property("ADBE Vector Transform Group");
        if (!repXform) throw "Could not access Repeater Transform group.";

        // 1) Repeater Anchor → layer Anchor
        var repAnchor = repXform.property("ADBE Vector Anchor");
        if (!repAnchor) {
            for (var j = 1; j <= repXform.numProperties; j++) {
                var p = repXform.property(j);
                if (!p) continue;
                var isMatch = (p.matchName === "ADBE Vector Anchor");
                var byName  = /anchor/i.test(p.name || "");
                var is2D    = (p.propertyValueType && p.propertyValueType === PropertyValueType.TwoD_SPATIAL);
                if (isMatch || (byName && is2D)) { repAnchor = p; break; }
            }
        }
        if (!repAnchor) throw "Could not access Repeater Transform > Anchor.";

        var exprAnchor = "thisLayer.transform.anchorPoint";
        if (repAnchor.canSetExpression) repAnchor.expression = exprAnchor;
        else repAnchor.setValue(layer.transform.anchorPoint.value);

        // 2) Repeater Position — leave free (clear legacy expr if present, init to [0,0])
        var repPos = findVectorPosition(repXform);
        if (repPos) {
            if (repPos.canSetExpression && repPos.expressionEnabled) repPos.expression = "";
            try {
                var v = repPos.value;
                if (!(v && v.length >= 2)) repPos.setValue([0,0]);
            } catch (_) { repPos.setValue([0,0]); }
        }
    }

    // --- robust finders for presets ---
    function findOneD(parent, preferredMatchNames, nameRegex) {
        // search by matchName, then by name regex + OneD value type
        for (var i=0;i<preferredMatchNames.length;i++){
            var p = parent.property(preferredMatchNames[i]);
            if (p) return p;
        }
        for (var j=1;j<=parent.numProperties;j++){
            var q = parent.property(j);
            if (!q) continue;
            if (nameRegex && nameRegex.test(q.name||"")) {
                if (q.propertyValueType === PropertyValueType.OneD) return q;
            }
        }
        // last resort: first OneD under parent
        for (var k=1;k<=parent.numProperties;k++){
            var r = parent.property(k);
            if (r && r.propertyValueType===PropertyValueType.OneD) return r;
        }
        return null;
    }
    function findVectorPosition(xform) {
        // try common IDs; else scan by name/valuetype
        var p = xform.property("ADBE Vector Position");
        if (p) return p;
        for (var i=1;i<=xform.numProperties;i++){
            var q = xform.property(i);
            if (!q) continue;
            var name = (q.name||"").toLowerCase();
            if ((/position/i.test(name)) &&
                (q.propertyValueType===PropertyValueType.TwoD || q.propertyValueType===PropertyValueType.TwoD_SPATIAL)) {
                return q;
            }
        }
        return null;
    }
    function findRotation(xform) {
        // Some builds expose rotation as "ADBE Vector Rotation", others can vary—match by name & OneD
        var p = xform.property("ADBE Vector Rotation") || xform.property("ADBE Vector Repeater Rotation");
        if (p) return p;
        return findOneD(xform, [], /rotation/i);
    }
    function findCopies(repeater) {
        // Usually "ADBE Vector Repeater Copies" on the repeater group (not xform)
        var p = repeater.property("ADBE Vector Repeater Copies") || repeater.property("ADBE Vector Repeater Copies 2");
        if (p) return p;
        return findOneD(repeater, [], /copies|copias|copie|kopien|copie/i);
    }

    // --- measure size for spacing ---
    function measureShapeSize(layer) {
        var contents = layer.property("ADBE Root Vectors Group");
        function scanGroup(group) {
            if (!group) return null;
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (!p) continue;

                if (p.matchName === "ADBE Vector Group") {
                    var res = scanGroup(p.property("ADBE Vectors Group"));
                    if (res) return res;
                }

                if (p.matchName === "ADBE Vector Shape - Rect") {
                    var size = p.property("ADBE Vector Rect Size");
                    if (size) { var sv = size.value; return [Math.abs(sv[0]), Math.abs(sv[1])]; }
                }
                if (p.matchName === "ADBE Vector Shape - Ellipse") {
                    var esize = p.property("ADBE Vector Ellipse Size");
                    if (esize) { var ev = esize.value; return [Math.abs(ev[0]), Math.abs(ev[1])]; }
                }
            }
            return null;
        }
        var byParam = scanGroup(contents);
        if (byParam) return byParam;

        var r = layer.sourceRectAtTime(layer.time, true);
        return [Math.abs(r.width), Math.abs(r.height)];
    }

    function applyRepeaterPreset(layer, repeater, presetName) {
        var repXform =
            repeater.property("ADBE Vector Repeater Transform") ||
            repeater.property("ADBE Vector Transform Group");
        if (!repXform) return;

        var pCopies = findCopies(repeater);
        var pPos    = findVectorPosition(repXform);
        var pRot    = findRotation(repXform);

        function clearExpr(prop){ if (prop && prop.canSetExpression && prop.expressionEnabled) prop.expression = ""; }
        function setNum(prop,val){ if (prop!=null){ clearExpr(prop); try{ prop.setValue(val);}catch(_){}} }
        function setVec(prop,arr){ if (prop!=null){ clearExpr(prop); try{ prop.setValue([arr[0],arr[1]]);}catch(_){}} }

        var size = measureShapeSize(layer), w = size[0]||0, h = size[1]||0;

        switch (presetName) {
            case "Vertical Repeater":
                setNum(pCopies, 10);
                setVec(pPos, [0, h]);
                setNum(pRot, 0);
                break;

            case "Horizontal Repeater":
                setNum(pCopies, 10);
                setVec(pPos, [w, 0]);
                setNum(pRot, 0);
                break;

            case "Spiral Repeater":
                setNum(pCopies, 10);
                setVec(pPos, [0, 0]);
                setNum(pRot, 10);
                break;

            case "Default":
            default:
                // leave AE defaults
                break;
        }
    }

    // Effects: AP Memory
    function effectsParade(layer){ return layer.property("ADBE Effect Parade"); }

    function ensureAPMemoryEffect(layer) {
        var fx = effectsParade(layer);
        if (!fx) throw "Could not access Effects on this layer.";
        var mem = fx.property("AP Memory");
        if (!mem) {
            mem = fx.addProperty("ADBE Point Control"); // 2D Point Control
            if (!mem) throw "Could not add 'AP Memory' effect.";
            mem.name = "AP Memory";
        }
        return mem;
    }
    function getAPMemoryPointProp(memEffect) {
        for (var i = 1; i <= memEffect.numProperties; i++) {
            var p = memEffect.property(i);
            if (p && (p.propertyValueType === PropertyValueType.TwoD ||
                      p.propertyValueType === PropertyValueType.TwoD_SPATIAL)) return p;
        }
        return memEffect.property(1) || null;
    }
    function saveAnchorToMemory(layer) {
        var tr = layer.property("ADBE Transform Group");
        var ap = tr && tr.property("ADBE Anchor Point");
        if (!ap) throw "Could not access layer Anchor Point.";
        var mem = ensureAPMemoryEffect(layer);
        var pointProp = getAPMemoryPointProp(mem);
        if (!pointProp) throw "Could not access 'AP Memory' point property.";
        pointProp.setValue([ap.value[0], ap.value[1]]);
        try { layer.comment = "[AP saved] " + ap.value[0].toFixed(1) + ", " + ap.value[1].toFixed(1); } catch(_) {}
    }
    function getSavedAnchor(layer) {
        var fx = effectsParade(layer);
        if (!fx) return null;
        var mem = fx.property("AP Memory"); if (!mem) return null;
        var pointProp = getAPMemoryPointProp(mem); if (!pointProp) return null;
        var v = pointProp.value; if (!(v && v.length >= 2)) return null;
        return [v[0], v[1]];
    }

    // ---------- Bootstrap ----------
    var win;
    if (thisObj instanceof Panel) {
        win = thisObj;
        win.text = "Center AP + Repeater";
        buildUI(win);
    } else {
        win = new Window("palette", "Center AP + Repeater", undefined, {resizeable:true});
        buildUI(win);
        win.minimumSize = [360, 170];
        win.onResizing = win.onResize = function(){ this.layout.resize(); };
        win.center(); win.show();
    }
})(this);
