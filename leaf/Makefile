# Bundle vscode extension as a leaf package
.SILENT:
.PHONY: clean all

# Some parameters and folders
OUTPUT:=out
INDEX:=$(OUTPUT)/index.json
INPUT_PACKAGE=../package/legato-plugin-$(VERSION).vsix
DATE=$(shell test -f $(INPUT_PACKAGE) && date -uR -r $(INPUT_PACKAGE))

# Names and version
VERSION ?= $(shell git describe --tags)
NAMES := swi-legato-vscode swi-legato-vscode-src
SRCDEP = `if $(IS_MAIN_PACK); then echo "--depends swi-legato-vscode-src_$(VERSION)(LEGATO_VSCODE_SRC)"; fi`
PACKAGES := $(foreach NAME,$(NAMES),$(OUTPUT)/$(NAME)_$(VERSION).leaf)
MANIFESTS := $(foreach NAME,$(NAMES),$(OUTPUT)/$(NAME)_$(VERSION)/manifest.json)
TEMPLATES := $(foreach NAME,$(NAMES),$(NAME)/template.json)
CUROUTPUT = $(subst /manifest.json,,$(subst .leaf,,$@))
CURNAME = $(subst _$(VERSION),,$(subst $(OUTPUT)/,,$(CUROUTPUT)))
IS_MAIN_PACK = test "$(CURNAME)" = "swi-legato-vscode"

all: $(INDEX)

$(INDEX): $(PACKAGES) Makefile
	cd $(OUTPUT) && leaf build index -o index.json --description "VSCode Legato extension packages" *.leaf

%.leaf: %/manifest.json Makefile
	cp -a $(CURNAME)/* $(CUROUTPUT)
	if $(IS_MAIN_PACK); then cp -a $(INPUT_PACKAGE) $(CUROUTPUT); fi
	leaf build pack \
		-o $@ \
		-i $(CUROUTPUT) \
		-- \
		-J --mtime="$(DATE)" --sort name --mode='a+r,a-w,u+w' --owner=0 --group=0 --numeric-owner  --exclude=template.json .

$(MANIFESTS): $(CURDIR)/Makefile $(TEMPLATES)
	mkdir -p $(CUROUTPUT)
	leaf build manifest \
		-o $(CUROUTPUT) \
		--name $(CURNAME) \
		--version $(VERSION) \
		--date "$(DATE)" \
		--append $(CURNAME)/template.json \
		$(SRCDEP)

clean:
	rm -Rf $(OUTPUT)
