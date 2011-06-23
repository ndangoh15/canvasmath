var forEachBinding = function (box, x, y, callback) {
    box.getContainers(x, y).forEach(function (c) {
	if (!c.box.boundLayouts) {
	    return;
	}
	c.box.boundLayouts.forEach(function (l) {
	    if (!l.layout.boundExprs) {
		return;
	    }
	    l.layout.boundExprs.forEach(function (e) {
		callback(c, l, e);
	    });
	});
    });
};

var getFirstBoundExpr = function (box, x, y) {
    var res;
    try {
	forEachBinding(box, x, y, function (c, l, e) {
	    res = e.expr;
	    throw "found";
	});
    } catch (err) {
	if (err === "found") {
	    return res;
	}
	throw err;
    }
};

var Clipboard = Prototype.specialise({
    __init__: function () {
	this.expr = null;
    },
    copy: function (e) {
	this.expr = e;
    },
    paste: function () {
	return this.expr;
    }
});

var Selection = Prototype.specialise({
    __init__: function (s) {
	this.reset(s);
    },
    replace: function (newExpr) {
	if (this.isSlice) {
	    this.expr.replaceSlice(this, newExpr);
	} else {
	    this.expr.parent.replaceChild(this.expr, newExpr);
	}
    },
    remove: function () {
	var newExpr;
	if (!this.expr) {
	    return;
	}
	if (this.isSlice) {
	    newExpr = this.start && this.start.previousSibling;
	    if (this.start && this.start.previousSibling) {
		this.expr.removeSlice(this);
	    }
	} else {
	    newExpr = this.expr.previousSibling;
	    this.expr.parent.removeChild(this.expr);
	}
	this.reset({expr: newExpr});
    },
    copyToClipboard: function (clipboard) {
	var expr;
	if (!this.expr) {
	    return;
	}
	if (this.isSlice) {
	    expr = this.expr.fromSlice(this);
	} else {
	    expr = this.expr.copy();
	}
	clipboard.copy(expr);
    },
    pasteFromClipboard: function (clipboard) {
	if (!this.expr) {
	    return;
	}
	var expr = clipboard.paste().copy();
	if (!expr) {
	    return;
	}
	this.replace(expr);
    },
    layout: function (layout) {
	if (this.isSlice) {
	    var l = this.expr.slicedLayout(layout, this);
	    l.elems[1] = layout.select(l.elems[1]);
	    return l;
	} else {
	    return layout.select(this.expr.layout(layout));
	}
    },
    reset: function (s) {
	this.set(s);
	if (s) {
	    this.stack = [s];
	    this.index = 0;
	} else {
	    this.stack = [];
	    this.index = null;
	}
    },
    set: function (s) {
	if (this.expr && s && s.expr !== this.expr) {
	    this.expr.clearSelected();
	    if (this.expr.isEditExpr) {
		editor.interpret(this.expr);
	    }
	}
	if (s && s.expr) {
	    this.expr = s.expr;
	    this.expr.setSelected(this);
	    this.start = s.start;
	    this.stop = s.stop;
	    this.isSlice = (s.start || s.stop) && s.expr.slicedLayout;  
	} else {
	    this.expr = this.start = this.stop = null;
	    this.isSlice = false;
	}
    },
    moveUp: function () {
	var s;
	if (!this.expr) {
	    return;
	} else if (this.stack.length > this.index + 1) {
	    this.set(this.stack[++this.index]);
	} else if (this.isSlice) {
	    s = {expr: this.expr};
	    this.stack.push(s);
	    this.set(s);
	    this.index++;
	} else if (this.expr.parent.isRoot) {
	    return;
	} else {
	    s = {expr: this.expr.parent};
	    this.stack.push(s);
	    this.set(s);
	    this.index++;
	}
    },
    moveDown: function () {
	var s;
	if (!this.expr) {
	    return;
	} else if (this.index > 0) {
	    this.set(this.stack[--this.index]);
	} else if (this.expr.firstChild) {
	    s = {expr: this.expr.firstChild};
	    this.stack.unshift(s);
	    this.set(s);
	}
    },
    moveLeft: function () {
	if (this.isSlice) {
	    if (this.start && this.start.previousSibling) {
		this.reset({expr: this.start.previousSibling});
	    }
	} else if (this.expr && this.expr.previousSibling) {
	    this.reset({expr: this.expr.previousSibling});
	}
    },
    moveRight: function () {
	if (this.isSlice) {
	    if (this.stop && this.stop.nextSibling) {
		this.reset({expr: this.stop.nextSibling});
	    }
	} else if (this.expr && this.expr.nextSibling) {
	    this.reset({expr: this.expr.nextSibling});
	}
    }
});

var PositionedExpressions = Prototype.specialise({
    __name__: "PositionedExpressions",
    __init__: function () {
	this.exprs = [];
    },
    add: function (expr, x, y) {
	this.exprs.push({
	    expr: expr,
	    box: layout.ofExpr(expr).box(),
	    x: x,
	    y: y
	});
    },
    remove: function (expr) {
	return this.exprs.some(function (item, i, items) {
	    if (item.expr === expr) {
		items.splice(i, 1);
		return true;
	    }
	    return false;
	});
    },
    update: function (expr) {
	return this.exprs.some(function (item) {
	    if (item.expr === expr) {
		item.box = layout.ofExpr(expr).box();
		return true;
	    }
	    return false;
	});
    },
    findFirstAt: function (x, y) {
	var i, item;
	for (i = 0; i < this.exprs.length; i++) {
	    item = this.exprs[i];
	    if (item.box.contains(x - item.x, y - item.y)) {
		return item;
	    }
	}
	return null;
    },
    drawOnCanvas: function (ctx) {
	this.exprs.forEach(function (item) {
	    // XXX This needs to be done only when necessary
	    item.box = layout.ofExpr(item.expr).box();
	    item.box.drawOnCanvas(ctx, item.x, item.y);
	});
    }
});

var testOnLoad = function () {
    var selection = Selection.instanciate();
    var shortcuts = KeyboardShortcuts.instanciate();
    var clipboard = Clipboard.instanciate();
    var posexprs = PositionedExpressions.instanciate();
    var serializers = {
	Simple: SimpleSerializer,
	RPN: RPNSerializer,
	LaTeX: LaTeXSerializer,
	GeoGebra: GeoGebraSerializer,
	Maxima: MaximaSerializer
    };
    Object.forEachItem(serializers, function (s) {
	if (serializers.hasOwnProperty(s)) {
	    console.log(s);
	    $("serializer").appendChild($.make("option", {name: s}, s));
	}
    });
    var currentSerializer = serializers.Simple;
    var exprBox;
    var mouseDownExpr;
    var mouseCoords;
    var copyShortcut = shortcuts.add('C-c', function () {
	selection.copyToClipboard(clipboard);
    });
    var pasteShortcut = shortcuts.add('C-v', function () {
	selection.pasteFromClipboard(clipboard);
	drawExprs();
    });
    var cutShortcut = shortcuts.add('C-x', function () {
	if (selection.expr) {
	    selection.copyToClipboard(clipboard);
	}
	if (selection.expr.parent.isRoot) {
	    posexprs.remove(selection.expr.parent);
	} else {
	    selection.remove();
	}
	selection.reset({expr: null});
	drawExprs();
    });
    var createShortcut = shortcuts.add('C-e', function (e) {
	if (!mouseCoords) { return; };
	var ed = expr.editExpr();
	var newExpr = root(ed);
	e.preventDefault();
	e.stopPropagation();
	posexprs.add(newExpr, mouseCoords.x, mouseCoords.y);
	selection.reset({expr: ed});
	drawExprs();
    });
    var serializeShortcut = shortcuts.add('C-s', function (e) {
	e.preventDefault();
	e.stopPropagation();
	if (selection.expr) {
	    $("serialization").value = currentSerializer.serialize(selection.expr);
	}
    });
    initBox();
    var ctx = $("testcvs").getContext("2d");
    /*var e = root(sum(
	br(frac(prod(-3, 45), sum(1, 2, 3))),
	prod(-2, -3, "x", "y", "z"),
	frac(-12, 34)
    ));
    posexprs.add(e, 20, 100);*/
    var drawExprs = function () {
	ctx.clearRect(0, 0, 800, 400);
	posexprs.drawOnCanvas(ctx);
    };
    drawExprs();
    window.addEventListener("keydown", function (e) {
	var sel, s;
	if (shortcuts.callFromEvent(e)) {
	    return;
	}
	switch (e.keyIdentifier) {
	    case "Up":
		selection.moveUp();
		break;
	    case "Down":
		selection.moveDown();
		break;
	    case "Left":
		selection.moveLeft();
		break;
	    case "Right":
		selection.moveRight();
		break;
	    case "U+0008": // Backspace
		e.preventDefault();
		e.stopPropagation();
		if (selection.expr) {
		    if (selection.expr.__proto__ === EditExpr) {
			s = selection.expr.content;
			if (s) {
			    s = s.substr(0, s.length - 1);
			    editor.interpret(selection.expr, s, true);
			} else {
			    sel = selection.expr.getPredecessor();
			    selection.remove();
			    if (sel.isRoot) {
				posexprs.remove(sel);
			    } else {
				selection.reset({expr: sel});
			    }
			}
		    } else {
			sel = expr.editExpr();
			selection.replace(sel);
			selection.reset({expr: sel});
		    }
		}
		break;
	    case "U+0009": // Tab
		e.preventDefault();
		e.stopPropagation();
		if (selection.expr && selection.expr.__proto__ === EditExpr) {
		    selection.expr.cycleCompletions();
		}
		break;
	}
	drawExprs();
    }, false);
    window.addEventListener("keypress", function (e) {
	var c;
	if (!e.charCode) {
	    return;
	}
	// Input character
	c = String.fromCharCode(e.charCode);
	if (selection.isSlice) {
	    var r = root(selection.expr.fromSlice(selection));
	    var e2 = editor.addChar(r.firstChild, c);
	    if (e2) {
		selection.expr.replaceSlice(selection, r.firstChild);
	    }
	    selection.reset({expr: e2});
	} else if (selection.expr) {
	    selection.reset({expr: editor.addChar(selection.expr, c)});
	}
	drawExprs();
    }, false);
    $("testcvs").addEventListener("mousedown", function (e) {
	var coords = getEventCoords(e, this);
	var item = posexprs.findFirstAt(coords.x, coords.y);
	var target = null;
	if (item) {
	    target = getFirstBoundExpr(item.box, coords.x - item.x, coords.y - item.y);
	}
	mouseDownExpr = target;
	selection.reset({expr: target});
	drawExprs();
    }, false);
    $("testcvs").addEventListener("mouseout", function (e) {
	mouseCoords = null;
    }, false);
    $("testcvs").addEventListener("mousemove", function (e) {
	var coords = mouseCoords = getEventCoords(e, this);
	if (!mouseDownExpr) {
	    return;
	}
	var item = posexprs.findFirstAt(coords.x, coords.y);
	if (!item) {
	    return;
	}
	var target = getFirstBoundExpr(item.box, coords.x - item.x, coords.y - item.y);
	if (mouseDownExpr) {
	    var s = mouseDownExpr.getSelection(target);
	    selection.reset(s);
	} else if (target) {
	    selection.reset({expr: target});
	} else {
	    selection.reset();
	}
	drawExprs();
    }, false);
    $("testcvs").addEventListener("mouseup", function (e) {
	mouseDownExpr = null;
    }, false);
    $("priority-mode").addEventListener("click", function (e) {
	operations.priorityMode = this.checked;
    }, false);
    operations.priorityMode = $("priority-mode").checked = true;
    $("prefixkwlist").innerHTML = prefixKeywords.list.
	map(function (x) { return x.kw; }).join(" ");
    $("postfixkwlist").innerHTML = postfixKeywords.list.
	map(function (x) { return x.kw; }).join(" ");

    [
	[createShortcut, "create-shortcut"],
	[copyShortcut, "copy-shortcut"],
	[pasteShortcut, "paste-shortcut"],
	[cutShortcut, "cut-shortcut"],
	[serializeShortcut, "serialize-shortcut"]
    ].forEach(function (x) {
	var id = x[1];
	var sh = x[0];
	$(id).innerHTML = sh.mods + sh.key;
    });
    $("serializer").addEventListener("change", function (e) {
	currentSerializer = serializers[this.options[this.selectedIndex].value];
    }, false);
    $("serialize").addEventListener("click", function (e) {
	if (selection.expr) {
	    $("serialization").value = currentSerializer.serialize(selection.expr);
	}
    }, false);
};