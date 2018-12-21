# Bundle vscode extension as a leaf package
.SILENT:
.PHONY: clean all

# Some parameters and folders
OUTPUT:=out
INDEX:=$(OUTPUT)/index.json
INPUT_PACKAGE=../package/legato-plugin-$(VERSION).vsix
DATE=$(shell export LANG=EN_en && test -f $(INPUT_PACKAGE) && date -u -r $(INPUT_PACKAGE))

# Names and version
VERSION:=$(shell git describe --tags)
LEAF_PACK_NAME:=swi-legato-vscode
LEAF_PACK:=$(OUTPUT)/$(LEAF_PACK_NAME)_$(VERSION).leaf
LEAF_PACK_SRC_NAME:=swi-legato-vscode-src
LEAF_PACK_SRC:=$(OUTPUT)/$(LEAF_PACK_SRC_NAME)_$(VERSION).leaf

# Usual tar args for leaf packaging (helps to make sure that generated .leaf files are reproducible with the same inputs)
LEAF_TAR_ARGS:=-J --mode='a+r,a-w,u+w' --owner=0 --group=0 --numeric-owner --sort name --mtime="`date -d "$(DATE)" -u`" --exclude=template.json .

all: $(INDEX)

$(INDEX): $(LEAF_PACK) $(LEAF_PACK_SRC) Makefile
	cd $(OUTPUT) && leaf build index -o index.json --description "VSCode Legato extension packages" *.leaf

$(LEAF_PACK): $(OUTPUT)/$(LEAF_PACK_NAME)/manifest.json $(LEAF_PACK_NAME)/hook.sh $(INPUT_PACKAGE) Makefile
	cp $(INPUT_PACKAGE) $(OUTPUT)/$(LEAF_PACK_NAME)
	cp $(LEAF_PACK_NAME)/* $(OUTPUT)/$(LEAF_PACK_NAME)
	leaf build pack -o $(LEAF_PACK) -i $(OUTPUT)/$(LEAF_PACK_NAME)/ -- $(LEAF_TAR_ARGS)

$(LEAF_PACK_SRC): $(OUTPUT)/$(LEAF_PACK_SRC_NAME)/manifest.json $(LEAF_PACK_SRC_NAME)/clone.sh Makefile
	cp $(LEAF_PACK_SRC_NAME)/* $(OUTPUT)/$(LEAF_PACK_SRC_NAME)
	leaf build pack -o $(LEAF_PACK_SRC) -i $(OUTPUT)/$(LEAF_PACK_SRC_NAME)/ -- $(LEAF_TAR_ARGS)

$(OUTPUT)/$(LEAF_PACK_NAME)/manifest.json: $(LEAF_PACK_NAME)/template.json Makefile
	mkdir -p $(OUTPUT)/$(LEAF_PACK_NAME)
	leaf build manifest \
		-o $(OUTPUT)/$(LEAF_PACK_NAME) \
		--name $(LEAF_PACK_NAME) \
		--version $(VERSION) \
		--description "Legato extension for VS Code" \
		--date "$(DATE)" \
		--master true \
		--upgradable true \
		--depends '$(LEAF_PACK_SRC_NAME)_$(VERSION)(LEGATO_VSCODE_SRC)' \
		--append $(LEAF_PACK_NAME)/template.json

$(OUTPUT)/$(LEAF_PACK_SRC_NAME)/manifest.json: $(LEAF_PACK_SRC_NAME)/template.json Makefile
	mkdir -p $(OUTPUT)/$(LEAF_PACK_SRC_NAME)
	leaf build manifest \
		-o $(OUTPUT)/$(LEAF_PACK_SRC_NAME) \
		--name $(LEAF_PACK_SRC_NAME) \
		--version $(VERSION) \
		--description "Source code for VS Code Legato extension" \
		--date "$(DATE)" \
		--depends swi-cloneutils_latest \
		--minver 1.2 \
		--append $(LEAF_PACK_SRC_NAME)/template.json

clean:
	rm -Rf $(OUTPUT)
