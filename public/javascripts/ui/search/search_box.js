// The search controller is responsible for managing document/metadata search.
dc.ui.SearchBox = dc.View.extend({

  PAGE_MATCHER        : (/\/p(\d+)$/),

  DOCUMENTS_URL : '/search/documents.json',

  // Error messages to display when your search returns no results.
  NO_RESULTS : {
    project : "This project does not contain any documents.",
    account : "This account has not uploaded any documents.",
    search  : "Your search did not match any documents."
  },

  id            : 'search',
  fragment      : null,

  callbacks : {
    '#search_box.keydown':  'maybeSearch',
    '#search_box.search':   'searchEvent',
    '#search_type.click':   '_setScope',
    '.cancel_search.click': 'cancelSearch'
  },

  // Creating a new SearchBox registers #search page fragments.
  constructor : function(options) {
    this.base(options);
    this.outstandingSearch = false;
    _.bindAll(this, '_loadSearchResults', '_loadFacetResults', 'searchByHash', 'showHelp', 'loadDefault');
    dc.history.register(/^#search\//, this.searchByHash);
    dc.history.register(/^#help$/, this.showHelp);
  },

  render : function() {
    $(this.el).append(JST.search_box({}));
    this.box      = $('#search_box', this.el);
    this.menu     = $('#search_type', this.el);
    this.titleBox = $('#title_box', this.el);
    $(document.body).setMode('no', 'search');
    this.setCallbacks();
    $('#cloud_edge').click(this.showHelp);
    (this._helpTab = $('#help_tab')).click(this.showHelp);
    (this._documentsTab = $('#documents_tab')).click(this.loadDefault);
    return this;
  },

  // Shortcut to the searchbox's value.
  value : function(query) {
    return this.box.val(query);
  },

  urlFragment : function() {
    return this.fragment + (this.page ? '/p' + this.page : '');
  },

  // Load the default starting-point search.
  loadDefault : function() {
    if (!Documents.empty()) return this.showDocuments();
    if (this.value()) {
      this.search(this.value());
    } else if (dc.app.documentCount) {
      Accounts.current().openDocuments();
    } else if (Projects.first()) {
      Projects.first().open();
    }
  },

  showDocuments : function() {
    $(document.body).setMode('active', 'search');
    this._helpTab.removeClass('active');
    this._documentsTab.addClass('active');
    this.entitle(this.value());
    dc.app.scroller.check();
    dc.history.save(this.urlFragment());
  },

  showHelp : function() {
    $(document.body).setMode('no', 'search');
    this._documentsTab.removeClass('active');
    this._helpTab.addClass('active');
    dc.app.scroller.check();
    dc.history.save('help');
    return false;
  },

  // Start a search for a query string, updating the page URL.
  search : function(query, pageNumber) {
    dc.ui.Project.highlight(query);
    this.page = pageNumber <= 1 ? null : pageNumber;
    this.value(query);
    this.fragment = 'search/' + encodeURIComponent(query);
    this.showDocuments();
    Documents.refresh();
    this.outstandingSearch = true;
    dc.ui.spinner.show('searching');
    dc.app.paginator.hide();
    var params = {q : query, include_facets : true};
    if (this.page) params.page = this.page;
    $.get(this.DOCUMENTS_URL, params, this._loadSearchResults, 'json');
  },

  loadFacets : function(facet) {
    dc.ui.spinner.show('searching');
    this.outstandingSearch = true;
    var params = {q : this.value(), include_facets : true, facet : facet};
    $.get(this.DOCUMENTS_URL, params, this._loadFacetResults, 'json');
  },

  // Ensure a given prefix for the search, used to scope searches down to
  // a specific qualifier.
  scopeSearch : function(prefix) {
    var search = this.value().replace(/^(organization|documents):\s+\S+ /, '');
    this.value(prefix + search);
  },

  // When searching by the URL's hash value, we need to unescape first.
  searchByHash : function(hash) {
    var page = null, connection = null;
    var pageMatch = hash.match(this.PAGE_MATCHER);
    if (pageMatch) {
      var page = pageMatch[1];
      hash = hash.replace(this.PAGE_MATCHER, '');
    }
    this.search(decodeURIComponent(hash), page);
  },

  // Add a query fragment to the search and search again, if it's not already
  // present in the current search.
  addToSearch : function(fragment) {
    if (this.value().toLowerCase().match(fragment.toLowerCase())) return;
    this.value(this.value() + " " + fragment);
    this.search(this.value());
  },

  // Remove a query fragment from the search and search again, only if it's
  // present in the current search.
  removeFromSearch : function(regex) {
    if (!this.value().match(regex)) return;
    var next = this.value().replace(regex, '');
    if (next == this.value()) return false;
    this.value(next);
    this.search(next);
    return true;
  },

  // Callback fired on key press in the search box. We search when they hit
  // return.
  maybeSearch : function(e) {
    var query = this.value();
    if (!this.outstandingSearch && e.keyCode == 13) this.search(query);
  },

  // Webkit knows how to fire a real "search" event.
  searchEvent : function(e) {
    var query = this.value();
    if (!this.outstandingSearch && query) this.search(query);
  },

  cancelSearch : function() {
    this.value('');
  },

  entitle : function(query) {
    var projectName = dc.app.SearchParser.extractProject(query);
    var accountName = dc.app.SearchParser.extractAccount(query);
    if (projectName) {
      this.titleBox.text(projectName);
    } else if (accountName == Accounts.current().get('email')) {
      this.titleBox.text('Uploaded Documents');
    } else {
      this.titleBox.text('All Documents');
    }
  },

  // Hide the spinner and remove the search lock when finished searching.
  doneSearching : function(empty) {
    if (empty) {
      $(document.body).setMode('empty', 'search');
      var searchType = dc.app.SearchParser.searchType(this.value());
      $('#no_results .explanation').text(this.NO_RESULTS[searchType]);
    }
    dc.ui.spinner.hide();
    this.outstandingSearch = false;
  },

  // After the initial search results come back, send out a request for the
  // associated metadata, as long as something was found. Think about returning
  // the metadata right alongside the document JSON.
  _loadSearchResults : function(resp) {
    dc.app.paginator.setQuery(resp.query);
    dc.app.workspace.organizer.renderFacets(resp.facets, 5, resp.query.total);
    Entities.refresh();
    Documents.refresh(_.map(resp.documents, function(m){
      return new dc.model.Document(m);
    }));
    this.doneSearching(resp.documents.length == 0);
  },

  _loadFacetResults : function(resp) {
    dc.app.workspace.organizer.mergeFacets(resp.facets, 500, resp.query.total);
    dc.ui.spinner.hide();
    this.outstandingSearch = false;
  },

  _setScope : function(e) {
    var scope = null;
    switch (this.menu.val()) {
      case 'all':     scope = '';                                                    break;
      case 'account': scope = 'account: ' + Accounts.current().get('email') + ' '; break;
      case 'group':   scope = 'group: ' + dc.app.organization.slug + ' ';     break;
    }
    this.scopeSearch(scope);
  }

});