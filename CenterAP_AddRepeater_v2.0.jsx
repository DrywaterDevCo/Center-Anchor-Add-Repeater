/* Center AnchorPoint + Repeater (Shape Layers) — v2.0
   - Centers layer Transform > Anchor Point to visual center (no visual jump)
   - Adds a Repeater
   - Links Repeater Transform > Anchor to layer Transform > Anchor
   - Presets for spacing (uses: path size EXCLUDING stroke + strokeW + 20)
   - Saves anchor snapshot to "Anchor Point Restore (don't change)" (Point Control)
   - NEW: Debug checkbox in UI (off by default) to show w/h/strokeW measurements
   - NEW: Creates Effect Controls on the layer to drive the Repeater via expressions:
       * Number of Copies (Slider)                → Repeater > Copies
       * Offset Amount (Slider)                → Repeater > Offset
       * Position (x,y) (Point)               → Repeater > Transform: Position
       * Scale (Point)                  → Repeater > Transform: Scale
       * Rotation (Slider)              → Repeater > Transform: Rotation
       * Start Opacity (Slider)         → Repeater > Transform: Start Opacity
       * End Opacity (Slider)           → Repeater > Transform: End Opacity
   Created by Stephen @ Drywater Dev Co.  contact: stephen@drywaterproductions.com
*/


(function (thisObj) {
    // ---------- UI ----------
    var gDebug = false; // updated from UI

    function buildUI(container) {
        container.orientation = "column";
        container.alignChildren = ["fill","top"];
        container.margins = 10;

        var title = container.add("statictext", undefined, "Center Anchor + Add Repeater");
        title.justify = "center";

        // Preset row
        var rowPreset = container.add("group");
        rowPreset.orientation = "row";
        rowPreset.alignChildren = ["left","center"];
        rowPreset.add("statictext", undefined, "Preset:");
        var ddPreset = rowPreset.add("dropdownlist", undefined, ["Default", "Vertical Repeater", "Horizontal Repeater", "Spiral Repeater"]);
        ddPreset.selection = 0;

        // Debug checkbox
        var rowDbg = container.add("group");
        rowDbg.orientation = "row";
        rowDbg.alignChildren = ["left","center"];
        var chkDebug = rowDbg.add("checkbox", undefined, "Debug (show size/stroke)");
        chkDebug.value = false;

        // Main action
        var row1 = container.add("group"); row1.orientation = "row"; row1.alignChildren = ["fill","center"];
        var btnDoIt = row1.add("button", undefined, "Do It");
        btnDoIt.alignment = ["fill","fill"];

        // Memory controls
        var row2 = container.add("group"); row2.orientation = "row"; row2.alignChildren = ["fill","center"];
        var btnUpdate = row2.add("button", undefined, "Update Anchor");
        var btnReset  = row2.add("button", undefined, "Reset Anchor");
        btnUpdate.alignment = ["fill","fill"];
        btnReset.alignment  = ["fill","fill"];

        // About
        var row3 = container.add("group"); row3.orientation = "row"; row3.alignChildren = ["fill","center"];
        var btnAbout = row3.add("button", undefined, "About");
        btnAbout.alignment = ["fill","fill"];

        var hint = container.add("statictext", undefined, "Select one shape layer, pick a preset, then Do It.");
        hint.characters = 56;

        btnDoIt.onClick   = function(){
            gDebug = !!chkDebug.value;
            var preset = ddPreset.selection ? ddPreset.selection.text : "Default";
            main(preset);
        };
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

            // 3) Bind: Repeater Anchor -> layer Anchor; leave Position free
            bindRepeater(layer, repeater);

            // 4) Apply preset tweaks to the newly added repeater
            applyRepeaterPreset(layer, repeater, presetName);

            // 5) Create "RC ..." controls and wire them to the repeater
            linkRepeaterToLayerControls(layer, repeater);

            // 6) Auto-save the anchor snapshot
            saveAnchorToMemory(layer);

        } catch (err) {
            alert("Center AP + Repeater\n" + err);
        } finally {
            app.endUndoGroup();
        }
    }

    function onUpdateAnchor() {
        app.beginUndoGroup("Update Anchor (Anchor Point Restore (don't change))");
        try {
            var comp  = getCompOrThrow();
            var layer = getSingleShapeLayerOrThrow(comp);
            saveAnchorToMemory(layer);
        } catch (e) {
            alert("Update Anchor\n" + e);
        } finally { app.endUndoGroup(); }
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
        } finally { app.endUndoGroup(); }
    }

    function onAbout() {
        var msg = "Center Anchor Point + Add Repeater is a script by Stephen @ Drywater Dev Co.  " +
                  "It takes the pain out of repeaters on shape layers being jacked up.  " +
                  "Simply create a shape layer anywhere, then run the script.  " +
                  "It will center the repeater anchor point to allow for the repeater to centered.  " +
                  "You can still move the center of the repeater by moving the anchor point of the shape layer.  " +
                  "If you manually move the anchor point, you can reset it via the \"Reset Anchor\" button, which will re-center the anchor point.";
        alert(msg, "About: Center AP + Repeater");
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
        var oldAP = ap.value, delta = [newAP[0]-oldAP[0], newAP[1]-oldAP[1]];
        ap.setValue([newAP[0], newAP[1]]);
        pos.setValue([pos.value[0] + delta[0], pos.value[1] + delta[1]]);
    }
    function centerLayerAnchorToContents(layer) {
        var contents = layer.property("ADBE Root Vectors Group");
        if (!contents || contents.numProperties === 0) throw "The shape layer has no contents. Add a shape first.";
        var r = layer.sourceRectAtTime(layer.time, false);
        setAnchorAndCompensate(layer, [r.left + r.width/2, r.top + r.height/2]);
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
        if (repAnchor.canSetExpression) repAnchor.expression = "thisLayer.transform.anchorPoint";
        else repAnchor.setValue(layer.transform.anchorPoint.value);

        // 2) Repeater Position — clear any legacy expr, init to [0,0]
        var repPos = findVectorPosition(repXform);
        if (repPos) {
            if (repPos.canSetExpression && repPos.expressionEnabled) repPos.expression = "";
            try { var v = repPos.value; if (!(v && v.length >= 2)) repPos.setValue([0,0]); }
            catch (_) { repPos.setValue([0,0]); }
        }
    }

    // --- robust finders ---
    function findOneD(parent, preferredMatchNames, nameRegex) {
        for (var i=0;i<preferredMatchNames.length;i++){ var p = parent.property(preferredMatchNames[i]); if (p) return p; }
        for (var j=1;j<=parent.numProperties;j++){
            var q = parent.property(j);
            if (!q) continue;
            if (nameRegex && nameRegex.test(q.name||"")) {
                if (q.propertyValueType === PropertyValueType.OneD) return q;
            }
        }
        for (var k=1;k<=parent.numProperties;k++){
            var r = parent.property(k);
            if (r && r.propertyValueType===PropertyValueType.OneD) return r;
        }
        return null;
    }
    function findVectorPosition(xform) {
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
        return xform.property("ADBE Vector Rotation") || xform.property("ADBE Vector Repeater Rotation") ||
               findOneD(xform, [], /rotation|rotación|rotation/i);
    }
    function findCopies(repeater) {
        return repeater.property("ADBE Vector Repeater Copies") || repeater.property("ADBE Vector Repeater Copies 2") ||
               findOneD(repeater, [], /copies|copias|copie|kopien|copie/i);
    }

    // --- measureShape(layer) patched (v1.9.7 logic) ---
    // Returns path size EXCLUDING stroke, and MAX stroke width found anywhere on the layer.
    function measureShape(layer) {
        var contents = layer.property("ADBE Root Vectors Group");

        var strokeW = null;             // max stroke width across the layer
        var sizeW = null, sizeH = null; // first usable path size (excluding stroke)

        function bboxFromShape(shapeVal) {
            if (!shapeVal || !shapeVal.vertices || !shapeVal.vertices.length) return null;
            var minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
            for (var i=0; i<shapeVal.vertices.length; i++) {
                var pt = shapeVal.vertices[i];
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
            }
            return { w: Math.max(0, maxX-minX), h: Math.max(0, maxY-minY) };
        }

        function walk(group) {
            if (!group) return;
            for (var i=1; i<=group.numProperties; i++) {
                var p = group.property(i);
                if (!p) continue;

                // Subgroup
                if (p.matchName === "ADBE Vector Group") {
                    walk(p.property("ADBE Vectors Group"));
                    continue;
                }

                // Track max stroke width
                if (p.matchName === "ADBE Vector Graphic - Stroke") {
                    var sw = p.property("ADBE Vector Stroke Width");
                    if (sw) {
                        var v = Math.abs(sw.value);
                        if (strokeW === null || v > strokeW) strokeW = v;
                    }
                    continue;
                }

                // Param rectangle / ellipse (sizes exclude stroke)
                if (p.matchName === "ADBE Vector Shape - Rect" && (sizeW === null || sizeH === null)) {
                    var s = p.property("ADBE Vector Rect Size");
                    if (s) { var v = s.value; sizeW = Math.abs(v[0]); sizeH = Math.abs(v[1]); }
                    continue;
                }
                if (p.matchName === "ADBE Vector Shape - Ellipse" && (sizeW === null || sizeH === null)) {
                    var e = p.property("ADBE Vector Ellipse Size");
                    if (e) { var ev = e.value; sizeW = Math.abs(ev[0]); sizeH = Math.abs(ev[1]); }
                    continue;
                }

                // Freeform path bbox (excludes stroke)
                if (p.matchName === "ADBE Vector Shape - Group" && (sizeW === null || sizeH === null)) {
                    var shp = p.property("ADBE Vector Shape");
                    if (shp) {
                        try {
                            var S = shp.value;
                            var bb = bboxFromShape(S);
                            if (bb) { sizeW = bb.w; sizeH = bb.h; }
                        } catch (_) {}
                    }
                }
            }
        }

        walk(contents);

        // Fallback: bounds WITHOUT stroke (includeExtents=false)
        if (sizeW === null || sizeH === null) {
            var r = layer.sourceRectAtTime(layer.time, false);
            sizeW = Math.abs(r.width);
            sizeH = Math.abs(r.height);
        }

        return { w: sizeW||0, h: sizeH||0, strokeW: strokeW||0 };
    }

    // --- presets (size + strokeW + 20) with optional debug alert ---
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

        var s = measureShape(layer);
        if (gDebug) {
            alert(
                "Measured (excluding stroke):\n" +
                "w = " + s.w.toFixed(2) + ", h = " + s.h.toFixed(2) + "\n" +
                "max strokeW = " + (s.strokeW||0).toFixed(2)
            );
        }

        var w = s.w || 0, h = s.h || 0;
        var extra = (s.strokeW || 0) + 20; // base padding

        switch (presetName) {
            case "Vertical Repeater":
                setNum(pCopies, 10);
                setVec(pPos, [0, h + extra]);
                setNum(pRot, 0);
                break;

            case "Horizontal Repeater":
                setNum(pCopies, 10);
                setVec(pPos, [w + extra, 0]);
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

    // ---------- Layer Controls ("RC …") and expressions wiring ----------
    function effectsParade(layer){ return layer.property("ADBE Effect Parade"); }

    function ensureSlider(layer, name, initialValue) {
        var fx = effectsParade(layer); if (!fx) throw "Could not access Effects on this layer.";
        var eff = fx.property(name);
        if (!eff) {
            eff = fx.addProperty("ADBE Slider Control");
            if (!eff) throw "Could not add '" + name + "' effect.";
            eff.name = name;
        }
        var prop = eff.property("ADBE Slider Control-0001") || eff.property(1);
        if (typeof initialValue === "number") try { prop.setValue(initialValue); } catch(_){}
        return prop; // the Slider property
    }
    function ensurePoint(layer, name, initialXY) {
        var fx = effectsParade(layer); if (!fx) throw "Could not access Effects on this layer.";
        var eff = fx.property(name);
        if (!eff) {
            eff = fx.addProperty("ADBE Point Control");
            if (!eff) throw "Could not add '" + name + "' effect.";
            eff.name = name;
        }
        var prop = eff.property("ADBE Point Control-0001") || eff.property(1); // the Point property
        if (initialXY && initialXY.length>=2) try { prop.setValue([initialXY[0], initialXY[1]]); } catch(_){}
        return prop;
    }

    function linkRepeaterToLayerControls(layer, repeater) {
        var repXform =
            repeater.property("ADBE Vector Repeater Transform") ||
            repeater.property("ADBE Vector Transform Group");
        if (!repXform) throw "Could not access Repeater Transform group.";

        // Locate repeater props
        var pCopies = findCopies(repeater);
        var pOffset = repeater.property("ADBE Vector Repeater Offset") || findOneD(repeater, [], /offset/i);
        var pPos    = findVectorPosition(repXform);
        var pScale  = repXform.property("ADBE Vector Scale") || (function(){
            for (var i=1;i<=repXform.numProperties;i++){
                var q=repXform.property(i);
                if (q && /scale/i.test(q.name||"") &&
                    (q.propertyValueType===PropertyValueType.TwoD || q.propertyValueType===PropertyValueType.TwoD_SPATIAL)) return q;
            }
            return null;
        })();
        var pRot    = findRotation(repXform);
        var pStartO = repXform.property("ADBE Vector Start Opacity") || findOneD(repXform, [], /start\s*opacity|opacidad/i);
        var pEndO   = repXform.property("ADBE Vector End Opacity")   || findOneD(repXform, [], /end\s*opacity|opacidad/i);

        // Read current values (post-preset) to seed controls
        var vCopies = pCopies ? pCopies.value : 3;
        var vOffset = pOffset ? pOffset.value : 0;
        var vPos    = pPos    ? pPos.value    : [0,0];
        var vScale  = pScale  ? pScale.value  : [100,100];
        var vRot    = pRot    ? pRot.value    : 0;
        var vStartO = pStartO ? pStartO.value : 100;
        var vEndO   = pEndO   ? pEndO.value   : 100;

        // Create controls (or reuse), initialize with current repeater values
        ensureSlider(layer, "Number of Copies",        vCopies);
        ensureSlider(layer, "Rotation",      vRot);
        ensureSlider(layer, "Offset Amount",        vOffset);
        ensurePoint (layer, "Position (x,y)",      vPos);
        ensurePoint (layer, "Scale",         vScale);
        ensureSlider(layer, "Start Opacity", vStartO);
        ensureSlider(layer, "End Opacity",   vEndO);

        // Expressions to bind repeater to controls
        function setExpr(prop, expr) {
            if (!prop) return;
            if (prop.canSetExpression) { prop.expression = expr; prop.expressionEnabled = true; }
        }

        setExpr(pCopies, "effect('Number of Copies')('Slider')");
        if (pOffset) setExpr(pOffset, "effect('Offset Amount')('Slider')");
        if (pPos)    setExpr(pPos,    "effect('Position (x,y)')('Point')");
        if (pScale)  setExpr(pScale,  "effect('Scale')('Point')");
        if (pRot)    setExpr(pRot,    "effect('Rotation')('Slider')");
        if (pStartO) setExpr(pStartO, "effect('Start Opacity')('Slider')");
        if (pEndO)   setExpr(pEndO,   "effect('End Opacity')('Slider')");
    }

    // Effects: Anchor Point Restore (don't change)
    function ensureAPMemoryEffect(layer) {
        var fx = effectsParade(layer);
        if (!fx) throw "Could not access Effects on this layer.";
        var mem = fx.property("Anchor Point Restore (don't change)");
        if (!mem) {
            mem = fx.addProperty("ADBE Point Control"); // 2D Point Control
            if (!mem) throw "Could not add 'Anchor Point Restore (don't change)' effect.";
            mem.name = "Anchor Point Restore (don't change)";
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
        if (!pointProp) throw "Could not access 'Anchor Point Restore (don't change)' point property.";
        pointProp.setValue([ap.value[0], ap.value[1]]);
        try { layer.comment = "[AP saved] " + ap.value[0].toFixed(1) + ", " + ap.value[1].toFixed(1); } catch(_) {}
    }
    function getSavedAnchor(layer) {
        var fx = effectsParade(layer);
        if (!fx) return null;
        var mem = fx.property("Anchor Point Restore (don't change)"); if (!mem) return null;
        var pointProp = getAPMemoryPointProp(mem); if (!pointProp) return null;
        var v = pointProp.value; if (!(v && v.length >= 2)) return null;
        return [v[0], v[1]];
    }

    // ---------- Bootstrap ----------
    var win;
    if (thisObj instanceof Panel) {
        win = thisObj; win.text = "Center AP + Repeater"; buildUI(win);
    } else {
        win = new Window("palette", "Center AP + Repeater", undefined, {resizeable:true});
        buildUI(win);
        win.minimumSize = [380, 190];
        win.onResizing = win.onResize = function(){ this.layout.resize(); };
        win.center(); win.show();
    }
})(this);
